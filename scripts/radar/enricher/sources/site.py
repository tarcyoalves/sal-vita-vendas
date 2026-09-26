"""
Fonte "site": abre a home do site da empresa e, no máximo, mais 2 páginas de
contato linkadas a partir dela. Respeita robots.txt.

Alimenta: whatsapps (wa.me / api.whatsapp.com), telefones, e-mails,
instagram/facebook (se linkados no site).
"""

from __future__ import annotations

import logging
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import config
import extract

logger = logging.getLogger("radar_enricher.sources.site")


def _fetch(url: str, timeout: float):
    from scrapling import Fetcher

    return Fetcher.get(
        url,
        timeout=timeout,
        stealthy_headers=True,
        headers={"User-Agent": config.USER_AGENT},
    )


def _allowed_by_robots(url: str) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = urllib.robotparser.RobotFileParser()
    try:
        rp.set_url(robots_url)
        rp.read()
    except Exception:  # noqa: BLE001 - sem robots.txt, ou inacessível: segue
        return True
    try:
        return rp.can_fetch(config.USER_AGENT, url)
    except Exception:  # noqa: BLE001
        return True


def _find_contact_links(html: str, base_url: str) -> list[str]:
    from scrapling import Selector

    sel = Selector(html)
    links: list[str] = []
    seen: set[str] = set()
    base_domain = extract.registrable_domain(base_url)
    for href in sel.css("a::attr(href)").getall():
        if not href:
            continue
        absolute = urljoin(base_url, href)
        if extract.registrable_domain(absolute) != base_domain:
            continue
        lowered = absolute.lower()
        if any(keyword in lowered for keyword in config.CONTACT_PAGE_KEYWORDS):
            if absolute not in seen:
                seen.add(absolute)
                links.append(absolute)
        if len(links) >= config.MAX_CONTACT_PAGES:
            break
    return links[: config.MAX_CONTACT_PAGES]


def run(website: str, breaker, rate_limiter) -> dict:
    """{"whatsapps": [...], "telefones": [...], "emails": [...],
        "instagram": str|None, "facebook": str|None,
        "ok": bool, "note": str|None}"""
    source = "site"
    empty = {
        "whatsapps": [], "telefones": [], "emails": [],
        "instagram": None, "facebook": None,
    }
    if "site" in config.DISABLED_SOURCES:
        return {**empty, "ok": False, "note": "desabilitado"}
    if not website:
        return {**empty, "ok": False, "note": "sem site"}

    paused_note = breaker.note_if_paused(source)
    if paused_note:
        return {**empty, "ok": False, "note": paused_note}

    domain_key = f"site:{extract.registrable_domain(website)}"

    if not _allowed_by_robots(website):
        return {**empty, "ok": False, "note": "robots.txt proíbe"}

    whatsapps: list[str] = []
    telefones: list[str] = []
    emails: list[str] = []
    instagram = None
    facebook = None
    pages_fetched = 0

    try:
        rate_limiter.wait(domain_key, min_interval=config.RATE_LIMIT_SECONDS["site"])
        resp = _fetch(website, config.PAGE_TIMEOUT_SECONDS)
        if resp.status in (403, 429) or extract.is_search_blocked(resp.body.decode("utf-8", "ignore"), resp.status):
            breaker.trip(source, f"HTTP {resp.status} ou bloqueio detectado em {website}")
            return {**empty, "ok": False, "note": "bloqueado"}
        pages_fetched += 1
        html = resp.body.decode("utf-8", "ignore")

        from scrapling import Selector

        sel = Selector(html)
        whatsapps += extract.extract_whatsapp_numbers(html)
        telefones += extract.extract_phones_from_tel_links(sel)
        telefones += extract.extract_phones_from_text(sel.get_all_text())
        emails += extract.extract_emails_from_mailto(sel)
        emails += extract.extract_emails_from_text(sel.get_all_text())
        for href in sel.css("a::attr(href)").getall():
            if not href:
                continue
            absolute = urljoin(website, href)
            kind = extract.is_social_domain(absolute)
            if kind == "instagram" and instagram is None:
                instagram = absolute
            elif kind == "facebook" and facebook is None:
                facebook = absolute

        contact_links = _find_contact_links(html, website)
        for link in contact_links:
            if not _allowed_by_robots(link):
                continue
            rate_limiter.wait(domain_key, min_interval=config.RATE_LIMIT_SECONDS["site"])
            try:
                sub_resp = _fetch(link, config.PAGE_TIMEOUT_SECONDS)
            except Exception as exc:  # noqa: BLE001
                logger.info("falha ao buscar página de contato %s: %s", link, exc)
                continue
            if sub_resp.status in (403, 429):
                continue
            pages_fetched += 1
            sub_html = sub_resp.body.decode("utf-8", "ignore")
            sub_sel = Selector(sub_html)
            whatsapps += extract.extract_whatsapp_numbers(sub_html)
            telefones += extract.extract_phones_from_tel_links(sub_sel)
            telefones += extract.extract_phones_from_text(sub_sel.get_all_text())
            emails += extract.extract_emails_from_mailto(sub_sel)
            emails += extract.extract_emails_from_text(sub_sel.get_all_text())
            for href in sub_sel.css("a::attr(href)").getall():
                if not href:
                    continue
                absolute = urljoin(link, href)
                kind = extract.is_social_domain(absolute)
                if kind == "instagram" and instagram is None:
                    instagram = absolute
                elif kind == "facebook" and facebook is None:
                    facebook = absolute

    except Exception as exc:  # noqa: BLE001 - uma fonte não pode derrubar o worker
        logger.warning("falha ao visitar site %s: %s", website, exc)
        return {**empty, "ok": False, "note": f"erro ao acessar site: {exc}"}

    return {
        "whatsapps": whatsapps,
        "telefones": telefones,
        "emails": emails,
        "instagram": instagram,
        "facebook": facebook,
        "ok": True,
        "note": None if pages_fetched > 0 else "nenhuma página acessível",
    }
