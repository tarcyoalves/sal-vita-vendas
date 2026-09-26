"""
Acesso ao banco (Neon PostgreSQL) para o enriquecedor.

O claim da fila usa SQL raw de propósito (`FOR UPDATE SKIP LOCKED`) — é a
mesma convenção do resto do repositório (ver HANDOFF-HERMES.md, seção 8:
"SQL raw é necessário em pontos específicos — não traduza"). Não reescreva
essa query em outra coisa: ela é o que garante que dois workers nunca
processem o mesmo CNPJ ao mesmo tempo.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional

import psycopg
from psycopg.rows import dict_row

import config

logger = logging.getLogger("radar_enricher.db")

# Estabelecimento carregado de radar_establishments — só os campos que o
# enriquecedor usa.
EstablishmentDict = dict


def get_connection() -> psycopg.Connection:
    if not config.DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL não configurada. Defina no ambiente (nunca no repositório) — "
            "ver scripts/radar/enricher/README.md."
        )
    conn = psycopg.connect(config.DATABASE_URL, autocommit=True, row_factory=dict_row)
    return conn


# ── Fila (radar_enrichment) ─────────────────────────────────────────────────

_CLAIM_SQL = """
    UPDATE radar_enrichment
    SET status = 'processando', claimed_at = now(), attempts = attempts + 1
    WHERE cnpj = (
        SELECT cnpj FROM radar_enrichment
        WHERE status = 'pendente'
           OR (status = 'processando' AND claimed_at < now() - interval '10 minutes')
        ORDER BY priority DESC, requested_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING cnpj, attempts
"""


def claim_job(conn: psycopg.Connection) -> Optional[dict]:
    """Pega um trabalho pendente (ou travado há mais de 10 min) da fila.

    Devolve {"cnpj": ..., "attempts": ...} ou None se a fila estiver vazia.
    """
    with conn.cursor() as cur:
        cur.execute(_CLAIM_SQL)
        row = cur.fetchone()
    return dict(row) if row else None


def mark_done(conn: psycopg.Connection, cnpj: str, result: dict) -> None:
    # Validade calculada no banco, com o mesmo relógio de finished_at/requested_at
    # (colunas TIMESTAMP sem fuso) — um datetime com fuso vindo do Python seria
    # convertido pelo TimeZone da sessão e poderia desalinhar do que o CRM compara.
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE radar_enrichment
            SET status = 'pronto', result = %s, error = NULL,
                finished_at = now(), expires_at = now() + make_interval(days => %s)
            WHERE cnpj = %s
            """,
            (json.dumps(result, ensure_ascii=False), config.ENRICH_TTL_DAYS, cnpj),
        )


def mark_failed(conn: psycopg.Connection, cnpj: str, attempts: int, error: str) -> None:
    """Depois de MAX_ATTEMPTS, marca 'falhou'. Antes disso, devolve para
    'pendente' para tentar de novo (sem esperar os 10 min do claim)."""
    error = (error or "")[:2000]
    if attempts >= config.MAX_ATTEMPTS:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE radar_enrichment
                SET status = 'falhou', error = %s, finished_at = now()
                WHERE cnpj = %s
                """,
                (error, cnpj),
            )
        logger.warning("cnpj=%s falhou definitivamente após %s tentativas: %s", cnpj, attempts, error)
    else:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE radar_enrichment
                SET status = 'pendente', error = %s, claimed_at = NULL
                WHERE cnpj = %s
                """,
                (error, cnpj),
            )
        logger.info("cnpj=%s devolvido para a fila (tentativa %s/%s): %s", cnpj, attempts, config.MAX_ATTEMPTS, error)


# ── Estabelecimento (radar_establishments) ──────────────────────────────────

def load_establishment(conn: psycopg.Connection, cnpj: str) -> Optional[EstablishmentDict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT razao_social, nome_fantasia, municipio_ibge, uf,
                   endereco, telefone1, telefone2, email
            FROM radar_establishments
            WHERE cnpj = %s
            """,
            (cnpj,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


# ── Municípios (server/data/municipios.json) ────────────────────────────────
# Formato: array de [ibge, nome, uf, lat, lon, siafi].

@lru_cache(maxsize=1)
def _municipios_by_ibge() -> dict:
    with open(config.MUNICIPIOS_JSON_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    return {row[0]: {"nome": row[1], "uf": row[2]} for row in raw}


def municipio_nome_uf(ibge: int) -> Optional[dict]:
    """{"nome": ..., "uf": ...} ou None se o código IBGE não for encontrado."""
    try:
        return _municipios_by_ibge().get(ibge)
    except FileNotFoundError:
        logger.error(
            "server/data/municipios.json não encontrado em %s — configure "
            "RADAR_MUNICIPIOS_JSON.",
            config.MUNICIPIOS_JSON_PATH,
        )
        return None


# ── Heartbeat (app_settings) ────────────────────────────────────────────────

def upsert_heartbeat(conn: psycopg.Connection) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
            """,
            (config.HEARTBEAT_KEY, now_iso),
        )
