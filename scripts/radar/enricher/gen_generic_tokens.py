"""Gera generic_tokens.txt: palavras que aparecem em muitos nomes da base.

Uso (na VPS, com DATABASE_URL no ambiente — nunca no repositório):
    .venv/bin/python gen_generic_tokens.py [limite]   # padrão: 120 empresas

Só LÊ radar_establishments. A saída é uma lista de palavras (sem dado de
empresa nenhuma), segura para versionar.
"""

from __future__ import annotations

import sys
from collections import Counter

import db
import extract


def main() -> None:
    limite = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    contagem: Counter = Counter()
    conn = db.get_connection()
    with conn.cursor(name="gen_generic_tokens") as cur:
        cur.execute("SELECT razao_social, nome_fantasia FROM radar_establishments")
        for razao, fantasia in cur:
            tokens = set(extract.normalize_name_tokens(razao or "")) | set(extract.normalize_name_tokens(fantasia or ""))
            contagem.update(t for t in tokens if len(t) >= 4)
    comuns = sorted(t for t, n in contagem.items() if n >= limite)
    with open("generic_tokens.txt", "w", encoding="utf-8") as f:
        f.write(f"# palavras em >= {limite} empresas da base (gerado por gen_generic_tokens.py)\n")
        f.write("\n".join(comuns) + "\n")
    print(f"{len(comuns)} palavras genéricas gravadas em generic_tokens.txt")


if __name__ == "__main__":
    main()
