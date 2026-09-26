"""
Fonte "social": abre os perfis públicos de Instagram/Facebook achados por
`busca`/`site` e extrai só o que é visível sem login (bio, wa.me na bio,
telefone/e-mail na bio, link externo).

NUNCA loga, nunca usa cookie de conta real, nunca cria conta. Se a página
exigir login, guarda a URL do perfil e marca note='perfil exige login' —
não tenta contornar de jeito nenhum.
"""

from __future__ import annotations

import logging

import config
import extract

logger = logging.getLogger("radar_enricher.sources.social")


def _fetch_html(url: str) -> str:
    from scrapling import Fetcher

    resp = Fetcher.get(
        url,
        timeout=15,
        stealthy_headers=True,
        headers={"User-Agent": config.USER_AGENT},
    )
    return resp.body.decode("utf-8", "ignore"), resp.status


def run(instagram: str | None, facebook: str | None, breaker, rate_limiter) -> dict:
    """{"whatsapps": [...], "telefones": [...], "emails": [...],
        "instagram": str|None, "facebook": str|None,
        "ok": bool, "note": str|None}"""
    source = "social"
    empty = {"whatsapps": [], "telefones": [], "emails": [], "instagram": instagram, "facebook": facebook}
    if "social" in config.DISABLED_SOURCES:
        return {**empty, "ok": False, "note": "desabilitado"}
    if not instagram and not facebook:
        return {**empty, "ok": False, "note": "nenhum perfil encontrado"}

    paused_note = breaker.note_if_paused(source)
    if paused_note:
        return {**empty, "ok": False, "note": paused_note}

    whatsapps: list[str] = []
    telefones: list[str] = []
    emails: list[str] = []
    notes: list[str] = []
    any_ok = False

    for url in (u for u in (instagram, facebook) if u):
        rate_limiter.wait(source)
        try:
            html, status = _fetch_html(url)
        except Exception as exc:  # noqa: BLE001 - uma fonte não pode derrubar o worker
            logger.info("falha ao abrir perfil social %s: %s", url, exc)
            notes.append(f"erro ao acessar {url}: {exc}")
            continue

        if status in (403, 429) or extract.is_search_blocked(html, status):
            breaker.trip(source, f"bloqueio detectado em {url}")
            notes.append("bloqueado")
            continue

        if extract.detect_login_wall(html):
            notes.append("perfil exige login")
            continue

        any_ok = True
        bio = extract.extract_social_bio_contacts(html)
        whatsapps += bio["whatsapps"]
        telefones += bio["phones"]
        emails += bio["emails"]

    return {
        "whatsapps": whatsapps,
        "telefones": telefones,
        "emails": emails,
        "instagram": instagram,
        "facebook": facebook,
        "ok": any_ok,
        "note": "; ".join(notes) if notes else None,
    }
