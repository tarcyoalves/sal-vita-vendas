"""
Fonte "maps": busca a empresa no Google Maps com um browser de verdade
(Scrapling StealthyFetcher/DynamicFetcher) e extrai o primeiro lugar
compatível.

PONTO MAIS FRÁGIL do enriquecedor: o HTML de busca do Google Maps muda com
frequência e não tem uma API pública gratuita equivalente. Os seletores
ficam concentrados em `extract.parse_maps_place` — se o Maps mudar o layout,
é ali que conserta.
"""

from __future__ import annotations

import logging
import urllib.parse

import config
import extract

logger = logging.getLogger("radar_enricher.sources.maps")


def build_query(establishment: dict, cidade: str, uf: str) -> str:
    nome = establishment.get("nome_fantasia") or establishment["razao_social"]
    return f"{nome} {cidade} {uf}"


def _fetch_html(url: str) -> str:
    # Import tardio (ver sources/busca.py) — StealthyFetcher/DynamicFetcher
    # abrem um browser real via Playwright/patchright, dependência pesada que
    # só precisa existir na VPS, não nos testes.
    try:
        from scrapling import StealthyFetcher as BrowserFetcher
    except ImportError:  # versões antigas do Scrapling chamavam de DynamicFetcher
        from scrapling import DynamicFetcher as BrowserFetcher

    resp = BrowserFetcher.fetch(
        url,
        headless=config.MAPS_HEADLESS,
        network_idle=True,
        timeout=30_000,
        google_search=False,
    )
    return resp.body.decode("utf-8", "ignore") if isinstance(resp.body, bytes) else str(resp.body)


def run(establishment: dict, cidade: str, uf: str, breaker, rate_limiter) -> dict:
    """{"maps": {...}|None, "phone": str|None, "website": str|None,
        "ok": bool, "note": str|None}"""
    source = "maps"
    empty = {"maps": None, "phone": None, "website": None}
    if "maps" in config.DISABLED_SOURCES:
        return {**empty, "ok": False, "note": "desabilitado"}

    paused_note = breaker.note_if_paused(source)
    if paused_note:
        return {**empty, "ok": False, "note": paused_note}

    company_name = establishment.get("nome_fantasia") or establishment["razao_social"]
    query = build_query(establishment, cidade, uf)
    url = "https://www.google.com/maps/search/" + urllib.parse.quote(query)

    rate_limiter.wait(source)
    try:
        html = _fetch_html(url)
    except Exception as exc:  # noqa: BLE001 - uma fonte não pode derrubar o worker
        logger.warning("falha ao abrir Google Maps para %s: %s", company_name, exc)
        return {**empty, "ok": False, "note": f"erro ao acessar Maps: {exc}"}

    if extract.is_search_blocked(html):
        breaker.trip(source, "Google Maps sinalizou bloqueio/captcha")
        return {**empty, "ok": False, "note": "bloqueado"}

    place = extract.parse_maps_place(html, url)
    if place is None:
        return {**empty, "ok": False, "note": "nenhum resultado"}

    if not extract.matches_company(place.get("nome"), place.get("endereco"), company_name, cidade):
        return {**empty, "ok": False, "note": "nenhum resultado compatível"}

    maps_data = {
        "url": url,
        "nome": place.get("nome"),
        "categoria": place.get("categoria"),
        "nota": place.get("nota"),
        "avaliacoes": place.get("avaliacoes"),
        "situacao": place.get("situacao"),
        "endereco": place.get("endereco"),
    }
    return {
        "maps": maps_data,
        "phone": place.get("phone"),
        "website": place.get("website"),
        "ok": True,
        "note": None,
    }
