#!/usr/bin/env python3
"""
Robô de enriquecimento do Radar de Cargas — roda na VPS do dono, fora da
Vercel (ver PLANO-RADAR-CARGAS.md e shared/radar.ts).

Consome a fila `radar_enrichment` (enfileirada pelo CRM quando um atendente
busca), varre buscador → site → Google Maps → Instagram/Facebook públicos
para cada CNPJ, e grava o resultado de volta.

Uso:
    cd scripts/radar/enricher
    python3 worker.py

Ver README.md para instalação, variáveis de ambiente e systemd.
"""

from __future__ import annotations

import logging
import signal
import sys
import time

import config
import db
import extract
from sources import busca, maps, site, social
from sources.circuit_breaker import CircuitBreaker
from sources.rate_limit import RateLimiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("radar_enricher.worker")

_running = True


def _handle_shutdown(signum, _frame):
    global _running
    logger.info("sinal %s recebido — terminando após o trabalho atual", signum)
    _running = False


def process_job(conn, cnpj: str, attempts: int, breaker: CircuitBreaker, rate_limiter: RateLimiter) -> None:
    establishment = db.load_establishment(conn, cnpj)
    if establishment is None:
        db.mark_failed(conn, cnpj, config.MAX_ATTEMPTS, "CNPJ não encontrado em radar_establishments")
        return

    municipio = db.municipio_nome_uf(establishment["municipio_ibge"])
    cidade = municipio["nome"] if municipio else ""
    uf = municipio["uf"] if municipio else establishment.get("uf", "")

    result = extract.empty_result()

    # 1) busca — site oficial + perfis sociais.
    busca_out = busca.run(establishment, cidade, uf, breaker, rate_limiter)
    extract.add_fonte(result, "busca", busca_out["ok"], busca_out.get("note"))
    website = busca_out.get("website")
    instagram = busca_out.get("instagram")
    facebook = busca_out.get("facebook")

    # 2) site — home + páginas de contato do site achado.
    site_out = site.run(website, breaker, rate_limiter)
    extract.add_fonte(result, "site", site_out["ok"], site_out.get("note"))
    if site_out["ok"]:
        for value in site_out["whatsapps"]:
            result["whatsapps"].append(extract.make_found(value, "site", website))
        for value in site_out["telefones"]:
            result["telefones"].append(extract.make_found(value, "site", website))
        for value in site_out["emails"]:
            result["emails"].append(extract.make_found(value, "site", website))
        instagram = instagram or site_out.get("instagram")
        facebook = facebook or site_out.get("facebook")

    # 3) maps — Google Maps (browser real).
    maps_out = maps.run(establishment, cidade, uf, breaker, rate_limiter)
    extract.add_fonte(result, "maps", maps_out["ok"], maps_out.get("note"))
    if maps_out["ok"]:
        result["maps"] = maps_out["maps"]
        if maps_out.get("phone"):
            result["telefones"].append(extract.make_found(maps_out["phone"], "maps", maps_out["maps"]["url"]))
        if maps_out.get("website") and not website:
            website = extract.normalize_website_url(maps_out["website"])

    # 4) social — perfis públicos de Instagram/Facebook.
    social_out = social.run(instagram, facebook, breaker, rate_limiter)
    extract.add_fonte(result, "social", social_out["ok"], social_out.get("note"))
    social_url = instagram or facebook
    for value in social_out["whatsapps"]:
        result["whatsapps"].append(extract.make_found(value, "social", social_url))
    for value in social_out["telefones"]:
        result["telefones"].append(extract.make_found(value, "social", social_url))
    for value in social_out["emails"]:
        result["emails"].append(extract.make_found(value, "social", social_url))

    result["website"] = website
    result["instagram"] = instagram
    result["facebook"] = facebook
    result = extract.finalize_result(result)

    errors = extract.validate_enrichment_shape(result)
    if errors:
        # Não deveria acontecer — mas se acontecer, é melhor falhar alto do
        # que gravar um JSON que quebra o contrato com o front.
        raise ValueError(f"resultado não bate com RadarEnrichmentData: {errors}")

    db.mark_done(conn, cnpj, result)
    logger.info("cnpj=%s enriquecido: %s", cnpj, [f["source"] for f in result["fontes"] if f["ok"]])


def main() -> None:
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    breaker = CircuitBreaker()
    rate_limiter = RateLimiter()

    logger.info("robô de enriquecimento do Radar de Cargas iniciado")
    if config.DISABLED_SOURCES:
        logger.info("fontes desabilitadas via ENRICH_DISABLE: %s", sorted(config.DISABLED_SOURCES))

    conn = db.get_connection()
    try:
        while _running:
            try:
                db.upsert_heartbeat(conn)
            except Exception:  # noqa: BLE001
                logger.exception("falha ao gravar heartbeat — reconectando")
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass
                conn = db.get_connection()
                continue

            try:
                job = db.claim_job(conn)
            except Exception:  # noqa: BLE001
                logger.exception("falha ao pegar trabalho da fila — reconectando")
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass
                conn = db.get_connection()
                time.sleep(config.POLL_IDLE_SECONDS)
                continue

            if job is None:
                time.sleep(config.POLL_IDLE_SECONDS)
                continue

            cnpj, attempts = job["cnpj"], job["attempts"]
            logger.info("processando cnpj=%s (tentativa %s)", cnpj, attempts)
            try:
                process_job(conn, cnpj, attempts, breaker, rate_limiter)
            except Exception as exc:  # noqa: BLE001 - o worker não pode morrer por um CNPJ ruim
                logger.exception("erro processando cnpj=%s", cnpj)
                try:
                    db.mark_failed(conn, cnpj, attempts, str(exc))
                except Exception:  # noqa: BLE001
                    logger.exception("falha ao marcar cnpj=%s como falho", cnpj)
    finally:
        conn.close()
        logger.info("robô de enriquecimento encerrado")


if __name__ == "__main__":
    sys.exit(main() or 0)
