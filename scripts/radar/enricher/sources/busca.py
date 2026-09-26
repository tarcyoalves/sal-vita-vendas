"""
Fonte "busca": procura o site oficial e perfis de Instagram/Facebook da
empresa num buscador. DuckDuckGo HTML primeiro, Bing HTML como reserva.

Nunca resolve captcha. Ao detectar bloqueio, pausa a fonte via
CircuitBreaker e devolve ok=False, note explicando.
"""

from __future__ import annotations

import logging
import urllib.parse

import config
import extract

logger = logging.getLogger("radar_enricher.sources.busca")


def build_query(establishment: dict, cidade: str, uf: str) -> str:
    nome = establishment.get("nome_fantasia") or establishment["razao_social"]
    return f'"{nome}" {cidade} {uf}'


def _fetch(url: str):
    # Import tardio: assim os testes de extract.py rodam mesmo sem Scrapling
    # instalado (a lógica de parsing não depende de rede nem de fetch).
    from scrapling import Fetcher

    return Fetcher.get(
        url,
        timeout=15,
        stealthy_headers=True,
        headers={"User-Agent": config.USER_AGENT},
    )


def run(establishment: dict, cidade: str, uf: str, breaker, rate_limiter) -> dict:
    """{"website": str|None, "instagram": str|None, "facebook": str|None,
        "ok": bool, "note": str|None}"""
    source = "busca"
    if "busca" in config.DISABLED_SOURCES:
        return {"website": None, "instagram": None, "facebook": None, "ok": False, "note": "desabilitado"}

    paused_note = breaker.note_if_paused(source)
    if paused_note:
        return {"website": None, "instagram": None, "facebook": None, "ok": False, "note": paused_note}

    query = build_query(establishment, cidade, uf)
    company_name = establishment.get("nome_fantasia") or establishment["razao_social"]

    results: list[dict] = []
    note: str | None = None
    ok = False

    # Tentativa 1: DuckDuckGo HTML.
    rate_limiter.wait(source)
    try:
        ddg_url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
        resp = _fetch(ddg_url)
        if extract.is_search_blocked(resp.body.decode("utf-8", "ignore"), resp.status):
            breaker.trip(source, "DuckDuckGo sinalizou bloqueio/captcha")
            note = "bloqueado no DuckDuckGo, tentando Bing"
        else:
            results = extract.parse_ddg_results(resp.body.decode("utf-8", "ignore"))
            ok = True
    except Exception as exc:  # noqa: BLE001 - uma fonte não pode derrubar o worker
        logger.warning("falha ao buscar no DuckDuckGo: %s", exc)
        note = f"DuckDuckGo indisponível: {exc}"

    # Tentativa 2: Bing HTML, se o DuckDuckGo não deu resultado nenhum.
    if not results:
        rate_limiter.wait(source)
        try:
            bing_url = "https://www.bing.com/search?q=" + urllib.parse.quote(query)
            resp = _fetch(bing_url)
            if extract.is_search_blocked(resp.body.decode("utf-8", "ignore"), resp.status):
                breaker.trip(source, "Bing sinalizou bloqueio/captcha")
                note = (note + "; " if note else "") + "bloqueado no Bing também"
            else:
                results = extract.parse_bing_results(resp.body.decode("utf-8", "ignore"))
                ok = True
                note = None
        except Exception as exc:  # noqa: BLE001
            logger.warning("falha ao buscar no Bing: %s", exc)
            note = (note + "; " if note else "") + f"Bing indisponível: {exc}"

    if not results:
        return {
            "website": None, "instagram": None, "facebook": None,
            "ok": ok, "note": note or "nenhum resultado",
        }

    social = extract.find_social_links_in_results(results)
    candidates = [r["url"] for r in results]
    website = extract.pick_best_website(candidates, company_name)
    website = extract.normalize_website_url(website) if website else None

    return {
        "website": website,
        "instagram": social["instagram"],
        "facebook": social["facebook"],
        "ok": True,
        "note": None if website or social["instagram"] or social["facebook"] else "nenhum site/perfil identificado",
    }
