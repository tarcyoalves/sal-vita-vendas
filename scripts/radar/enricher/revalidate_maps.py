"""Reconfere, SEM abrir o Maps, os resultados de Maps já gravados com a regra atual.

O resultado guarda o nome do lugar que o robô achou (`result.maps.nome`) e o
telefone do Maps; basta aplicar `matches_company_strict` de novo. Só as
linhas reprovadas precisam voltar à fila do robô.

Uso (na VPS, com DATABASE_URL no ambiente):
    .venv/bin/python revalidate_maps.py            # só LÊ e mostra contagens
    .venv/bin/python revalidate_maps.py --apply    # grava (uma transação)

--apply:
  - 'rejeitar'       -> tira maps e os telefones do Maps do resultado e volta
                        a linha para a fila (priority 1) para o robô refazer;
  - 'tirar_telefone' -> só remove o telefone do Maps (DDD de outro estado com
                        nome igual); a linha continua 'pronto'.
"""

from __future__ import annotations

import json
import sys
from collections import Counter

import db
import extract

_SELECT = """
    SELECT r.cnpj, r.result
    FROM radar_enrichment r
    WHERE r.status = 'pronto'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(r.result->'fontes') f
        WHERE f->>'source' = 'maps' AND (f->>'ok')::boolean = true
      )
"""


def avaliar(result: dict, establishment: dict, uf: str) -> str:
    """'ok' | 'tirar_telefone' | 'rejeitar' | 'sem_maps'."""
    maps = result.get("maps")
    if not maps:
        return "sem_maps"
    nome = maps.get("nome")
    nomes = [n for n in (
        establishment.get("nome_fantasia"),
        extract.strip_legal_suffixes(establishment.get("nome_fantasia") or ""),
        establishment.get("razao_social"),
        extract.strip_legal_suffixes(establishment.get("razao_social") or ""),
    ) if n]
    if not any(extract.matches_company_strict(nome, n) for n in nomes):
        return "rejeitar"
    telefones_maps = [t.get("value") for t in result.get("telefones", []) if t.get("source") == "maps"]
    if any(extract.phone_ddd_conflicts_uf(t, uf) for t in telefones_maps if t):
        if any(extract.matches_company_exact(nome, n) for n in nomes):
            return "tirar_telefone"
        return "rejeitar"
    return "ok"


def sem_maps(result: dict) -> dict:
    novo = dict(result)
    novo["maps"] = None
    novo["telefones"] = [t for t in result.get("telefones", []) if t.get("source") != "maps"]
    return novo


def sem_telefone_maps(result: dict) -> dict:
    """Mantém o lugar do Maps, tira só o(s) telefone(s) vindos dele."""
    return {**result, "telefones": [t for t in result.get("telefones", []) if t.get("source") != "maps"]}


def main() -> None:
    aplicar = "--apply" in sys.argv
    conn = db.get_connection()
    with conn.cursor() as cur:
        cur.execute(_SELECT)
        linhas = cur.fetchall()
    contagem: Counter = Counter()
    decisoes: list[tuple[str, str, dict]] = []
    for linha in linhas:
        est = db.load_establishment(conn, linha["cnpj"])
        if est is None:
            continue
        municipio = db.municipio_nome_uf(est["municipio_ibge"])
        uf = municipio["uf"] if municipio else est.get("uf", "")
        decisao = avaliar(linha["result"], est, uf)
        contagem[decisao] += 1
        decisoes.append((linha["cnpj"], decisao, linha["result"]))
    print(f"{len(linhas)} linhas com Maps ok:", dict(contagem))
    if not aplicar:
        print("dry-run: nada foi gravado. Use --apply para gravar.")
        return
    with conn.transaction():
        with conn.cursor() as cur:
            for cnpj, decisao, result in decisoes:
                if decisao == "rejeitar":
                    cur.execute(
                        """UPDATE radar_enrichment
                           SET status = 'pendente', priority = 1, requested_at = now(),
                               attempts = 0, claimed_at = NULL, error = NULL, result = %s::jsonb
                           WHERE cnpj = %s AND status = 'pronto'""",
                        (json.dumps(sem_maps(result)), cnpj),
                    )
                elif decisao == "tirar_telefone":
                    cur.execute(
                        "UPDATE radar_enrichment SET result = %s::jsonb WHERE cnpj = %s AND status = 'pronto'",
                        (json.dumps(sem_telefone_maps(result)), cnpj),
                    )
    print("aplicado:", {k: v for k, v in contagem.items() if k in ("rejeitar", "tirar_telefone")})


if __name__ == "__main__":
    main()
