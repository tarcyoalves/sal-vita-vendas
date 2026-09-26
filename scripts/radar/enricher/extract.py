"""
Funções puras de parsing/normalização do enriquecedor do Radar de Cargas.

Nada aqui faz rede. Cada função recebe HTML/texto já baixado (por sources/*.py,
que usa Scrapling) e devolve dados normalizados. Isso deixa a lógica de
extração 100% testável sem rede — os testes em tests/test_extract.py usam
apenas fixtures HTML salvas em disco.

O formato final (RadarEnrichmentData) precisa bater com shared/radar.ts.
"""

from __future__ import annotations

import base64
import re
import unicodedata
from typing import Optional
from urllib.parse import parse_qs, urlparse, unquote

from scrapling import Selector

# ── Telefones ──────────────────────────────────────────────────────────────

# DDDs válidos no Brasil (ANATEL). Dois dígitos, sem zero à esquerda.
VALID_DDDS = {
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24,
    27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61,
    62, 64,
    63,
    65, 66,
    67,
    68,
    69,
    71, 73, 74, 75, 77,
    79,
    81, 87,
    82,
    83,
    84,
    85, 88,
    86, 89,
    91, 93, 94,
    92, 97,
    95,
    96,
    98, 99,
}

# CNPJ com máscara ("12.345.678/0001-90") e CEP com máscara ("59600-000") —
# removidos do texto ANTES de procurar telefone, para não confundir os dois.
_CNPJ_MASKED_RE = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")
_CEP_MASKED_RE = re.compile(r"\b\d{5}-\d{3}\b")
_CNPJ_DIGITS_RE = re.compile(r"\b\d{14}\b")

# Telefone em formatos comuns: com/sem DDD entre parênteses, com/sem hífen.
_PHONE_CANDIDATE_RE = re.compile(
    r"(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}"
)

_TEL_HREF_RE = re.compile(r"tel:([\d+()\-.\s]+)", re.IGNORECASE)

_WA_ME_RE = re.compile(r"wa\.me/(\d{8,15})")
_WA_API_RE = re.compile(r"api\.whatsapp\.com/send\?[^\"'\s<>]*phone=(\d{8,15})")


def _strip_cnpj_cep(text: str) -> str:
    text = _CNPJ_MASKED_RE.sub(" ", text)
    text = _CEP_MASKED_RE.sub(" ", text)
    text = _CNPJ_DIGITS_RE.sub(" ", text)
    return text


def _is_repeated_or_sequential(digits: str) -> bool:
    if len(set(digits)) == 1:
        return True
    ascending = "".join(str((int(digits[0]) + i) % 10) for i in range(len(digits)))
    descending = "".join(str((int(digits[0]) - i) % 10) for i in range(len(digits)))
    return digits in (ascending, descending)


def normalize_phone(raw: str, *, allow_country_prefix: bool = True) -> Optional[str]:
    """Normaliza um telefone brasileiro para DDD+número (10 ou 11 dígitos).

    Devolve None se não parecer um telefone brasileiro válido (rejeita CNPJ,
    CEP, sequências óbvias e DDDs inexistentes).
    """
    digits = re.sub(r"\D", "", raw or "")
    if allow_country_prefix and len(digits) in (12, 13) and digits.startswith("55"):
        digits = digits[2:]
    if len(digits) not in (10, 11):
        return None
    ddd = int(digits[:2])
    if ddd not in VALID_DDDS:
        return None
    rest = digits[2:]
    if _is_repeated_or_sequential(rest):
        return None
    if len(rest) == 9 and rest[0] != "9":
        return None
    if len(rest) == 8 and rest[0] not in "2345":
        return None
    return digits


def extract_phones_from_text(text: str) -> list[str]:
    """Extrai telefones brasileiros normalizados de um texto livre.

    Remove primeiro CNPJ/CEP com máscara e CNPJ em 14 dígitos corridos, para
    não confundir com telefone.
    """
    cleaned = _strip_cnpj_cep(text or "")
    found: list[str] = []
    seen: set[str] = set()
    for match in _PHONE_CANDIDATE_RE.finditer(cleaned):
        normalized = normalize_phone(match.group(0))
        if normalized and normalized not in seen:
            seen.add(normalized)
            found.append(normalized)
    return found


def extract_phones_from_tel_links(selector: "Selector") -> list[str]:
    """Extrai telefones de `<a href="tel:...">`."""
    found: list[str] = []
    seen: set[str] = set()
    for href in selector.css("a::attr(href)").getall():
        if not href:
            continue
        m = _TEL_HREF_RE.search(href)
        if not m:
            continue
        normalized = normalize_phone(m.group(1))
        if normalized and normalized not in seen:
            seen.add(normalized)
            found.append(normalized)
    return found


def extract_whatsapp_numbers(html: str) -> list[str]:
    """Extrai números de link wa.me / api.whatsapp.com/send?phone=.

    Esses SÃO WhatsApp de fato (é o próprio link oficial de conversa) —
    diferente de um telefone solto no texto, que é só "provável celular".
    """
    found: list[str] = []
    seen: set[str] = set()
    for pattern in (_WA_ME_RE, _WA_API_RE):
        for match in pattern.finditer(html or ""):
            normalized = normalize_phone(match.group(1))
            if normalized and normalized not in seen:
                seen.add(normalized)
                found.append(normalized)
    return found


def likely_mobile(digits: str) -> bool:
    return len(digits) == 11 and digits[2] == "9"


# ── E-mails ───────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+")

# TLDs que na verdade são extensão de arquivo de imagem/asset (ex.: x@2x.png).
_JUNK_TLDS = {
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico",
    "css", "js", "map", "woff", "woff2", "ttf", "eot",
}

# Domínios de terceiros que aparecem em qualquer site (analytics, CDN,
# recaptcha, placeholders) e nunca são o contato real da empresa.
_PLACEHOLDER_EMAIL_DOMAINS = {
    "example.com", "example.org", "email.com", "domain.com",
    "sentry.io", "sentry-next.wixpress.com", "wixpress.com",
    "godaddy.com", "schema.org", "w3.org", "gstatic.com",
    "cloudflare.com", "unpkg.com", "jsdelivr.net", "github.io",
    "google.com", "googleapis.com", "wordpress.org", "wp.com",
}


def is_junk_email(email: str) -> bool:
    local, _, domain = email.lower().partition("@")
    if not local or not domain:
        return True
    if domain in _PLACEHOLDER_EMAIL_DOMAINS:
        return True
    tld = domain.rsplit(".", 1)[-1]
    if not tld.isalpha():
        return True
    if tld in _JUNK_TLDS:
        return True
    if any(seg.isdigit() for seg in domain.split(".")):
        return True
    return False


def extract_emails_from_text(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in _EMAIL_RE.finditer(text or ""):
        email = match.group(0).lower()
        if is_junk_email(email):
            continue
        if email not in seen:
            seen.add(email)
            found.append(email)
    return found


def extract_emails_from_mailto(selector: "Selector") -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for href in selector.css("a::attr(href)").getall():
        if not href or not href.lower().startswith("mailto:"):
            continue
        addr = href[len("mailto:"):].split("?", 1)[0].strip().lower()
        if addr and not is_junk_email(addr) and addr not in seen:
            seen.add(addr)
            found.append(addr)
    return found


# ── Normalização de texto / nomes de empresa ────────────────────────────────

_LEGAL_SUFFIXES = {
    "ltda", "me", "epp", "eireli", "sa", "s/a", "s.a", "mei",
    "comercio", "comercial", "industria", "industrial", "de", "da", "do",
    "dos", "das", "e", "cia", "companhia",
}


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in normalized if not unicodedata.combining(c))


def normalize_name_tokens(name: str) -> list[str]:
    """Tokens significativos de um nome de empresa (sem sufixo jurídico)."""
    ascii_name = strip_accents(name or "").lower()
    ascii_name = re.sub(r"[^a-z0-9\s]", " ", ascii_name)
    tokens = [t for t in ascii_name.split() if len(t) >= 3 and t not in _LEGAL_SUFFIXES]
    return tokens


def normalize_text_loose(text: str) -> str:
    ascii_text = strip_accents(text or "").lower()
    return re.sub(r"[^a-z0-9\s]", " ", ascii_text)


# ── Seleção de site (diretórios × domínio provável) ─────────────────────────

# Agregadores/diretórios de CNPJ, redes sociais (tratadas à parte) e outros
# domínios que nunca são o site oficial da empresa.
DIRECTORY_DOMAINS = {
    "cnpj.biz", "casadosdados.com.br", "econodata.com.br", "cnpja.com",
    "empresascnpj.com", "solutudo.com.br", "guiamais.com.br",
    "telelistas.net", "linkedin.com", "jusbrasil.com.br",
    "reclameaqui.com.br", "mercadolivre.com.br", "olx.com.br",
    "indeed.com", "indeed.com.br", "glassdoor.com.br", "apontador.com.br",
    "empresite.com.br", "consultasocio.com", "econodata.com",
    "b2b.com.br", "yellow.com.br", "listaempresa.com.br",
    "wikipedia.org", "youtube.com", "twitter.com", "x.com", "tiktok.com",
    "pinterest.com", "amazon.com.br", "shopee.com.br", "buscape.com.br",
}

_SOCIAL_DOMAINS = ("facebook.com", "instagram.com", "fb.watch", "fb.com")


def registrable_domain(url: str) -> Optional[str]:
    try:
        netloc = urlparse(url).netloc.lower()
    except ValueError:
        return None
    netloc = netloc.split("@")[-1].split(":")[0]
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc or None


def is_directory_domain(url: str) -> bool:
    domain = registrable_domain(url)
    if not domain:
        return True
    if domain in DIRECTORY_DOMAINS:
        return True
    if "google." in domain or domain == "goo.gl" or domain == "g.page":
        return True
    if "gov.br" in domain:
        return True
    if any(social in domain for social in _SOCIAL_DOMAINS):
        return True
    return False


# Caminhos que não são um perfil de verdade: botão de compartilhar, pixel de
# rastreio, tela de login, páginas institucionais... Achados como esses viram
# ruído (ex.: "https://www.facebook.com/" de um botão de "compartilhar").
_SOCIAL_JUNK_PATH_SEGMENTS = {
    "", "sharer", "share", "share.php", "sharer.php", "dialog", "plugins",
    "tr", "login", "login.php", "help", "policies", "legal", "ads",
    "business", "privacy", "terms", "accounts", "explore", "reel", "reels",
    "stories", "hashtag",
}


def is_social_domain(url: str) -> Optional[str]:
    """Devolve 'instagram', 'facebook' ou None — só para um link de PERFIL de
    verdade (não um botão de compartilhar, pixel de rastreio, tela de login
    etc. — ver _SOCIAL_JUNK_PATH_SEGMENTS)."""
    domain = registrable_domain(url)
    if not domain:
        return None
    kind = None
    if "instagram.com" in domain:
        kind = "instagram"
    elif "facebook.com" in domain or domain in ("fb.watch", "fb.com"):
        kind = "facebook"
    if kind is None:
        return None
    path = urlparse(url).path.strip("/")
    first_segment = path.split("/")[0].lower() if path else ""
    if first_segment in _SOCIAL_JUNK_PATH_SEGMENTS:
        return None
    return kind


def score_website_candidate(url: str, company_name: str) -> int:
    """Quanto o domínio do candidato "parece" ser o site da empresa.

    Conta quantos tokens significativos do nome aparecem no domínio. 0 =
    nenhuma relação aparente (candidato fraco demais para aceitar).
    """
    domain = registrable_domain(url)
    if not domain or is_directory_domain(url):
        return 0
    domain_ascii = strip_accents(domain)
    tokens = normalize_name_tokens(company_name)
    if not tokens:
        return 0
    score = 0
    first_label = domain_ascii.split(".")[0]
    for token in tokens:
        if token in domain_ascii:
            score += 1
            if first_label.startswith(token) or token.startswith(first_label):
                score += 1
    return score


def pick_best_website(candidates: list[str], company_name: str) -> Optional[str]:
    best_url: Optional[str] = None
    best_score = 0
    seen_domains: set[str] = set()
    for url in candidates:
        domain = registrable_domain(url)
        if not domain or domain in seen_domains:
            continue
        seen_domains.add(domain)
        score = score_website_candidate(url, company_name)
        if score > best_score:
            best_score = score
            best_url = url
    return best_url if best_score > 0 else None


def normalize_website_url(url: str) -> Optional[str]:
    """https, sem parâmetro de tracking, sem barra/hash finais supérfluos."""
    if not url:
        return None
    parsed = urlparse(url if "://" in url else f"https://{url}")
    if not parsed.netloc:
        return None
    scheme = "https"
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/")
    normalized = f"{scheme}://{netloc}{path}"
    return normalized


# ── Buscador: DuckDuckGo HTML e Bing HTML ───────────────────────────────────

_DDG_BLOCK_MARKERS = (
    "anomaly-modal", "challenge-form", "unusual traffic", "detected unusual",
)
_GENERIC_BLOCK_MARKERS = (
    "detected unusual traffic", "are you a robot", "captcha", "access denied",
    "unusual activity", "verify you are a human", "request blocked",
)


def is_search_blocked(html: str, status_code: Optional[int] = None) -> bool:
    if status_code in (403, 429):
        return True
    lowered = (html or "").lower()
    return any(marker in lowered for marker in _DDG_BLOCK_MARKERS) or any(
        marker in lowered for marker in _GENERIC_BLOCK_MARKERS
    )


def _unwrap_ddg_redirect(href: str) -> str:
    """DDG HTML embrulha o link em `//duckduckgo.com/l/?uddg=<url-encoded>`."""
    if not href:
        return href
    if "uddg=" in href:
        parsed = urlparse(href if href.startswith("http") else f"https:{href}")
        qs = parse_qs(parsed.query)
        target = qs.get("uddg", [None])[0]
        if target:
            return unquote(target)
    return href


def parse_ddg_results(html: str) -> list[dict]:
    """[{title, url}] a partir do HTML de html.duckduckgo.com/html/."""
    if is_search_blocked(html):
        return []
    sel = Selector(html)
    results = []
    links = sel.css("a.result__a")
    for link in links:
        href = link.attrib.get("href")
        title = link.get_all_text() if hasattr(link, "get_all_text") else "".join(link.css("::text").getall())
        if not href:
            continue
        url = _unwrap_ddg_redirect(href)
        if url.startswith("http"):
            results.append({"title": (title or "").strip(), "url": url})
    return results


def _unwrap_bing_redirect(href: str) -> str:
    """Bing embrulha boa parte dos links orgânicos em
    `https://www.bing.com/ck/a?...&u=a1<base64 da url>...`. Sem desembrulhar,
    todo resultado do Bing viraria um link de clique do próprio Bing."""
    if not href:
        return href
    parsed = urlparse(href)
    if not parsed.netloc.endswith("bing.com") or parsed.path != "/ck/a":
        return href
    qs = parse_qs(parsed.query)
    encoded = qs.get("u", [None])[0]
    if not encoded or not encoded.startswith("a1"):
        return href
    b64 = encoded[2:]
    b64 += "=" * (-len(b64) % 4)
    try:
        decoded = base64.urlsafe_b64decode(b64).decode("utf-8", "ignore")
    except (ValueError, UnicodeDecodeError):
        return href
    return decoded if decoded.startswith("http") else href


def parse_bing_results(html: str) -> list[dict]:
    """[{title, url}] a partir do HTML de www.bing.com/search."""
    if is_search_blocked(html):
        return []
    sel = Selector(html)
    results = []
    for item in sel.css("li.b_algo"):
        href = item.css("h2 a::attr(href)").get()
        title = item.css("h2 a::text").get()
        if href and href.startswith("http"):
            results.append({"title": (title or "").strip(), "url": _unwrap_bing_redirect(href)})
    return results


def find_social_links_in_results(results: list[dict]) -> dict:
    social = {"instagram": None, "facebook": None}
    for item in results:
        kind = is_social_domain(item.get("url", ""))
        if kind and social[kind] is None:
            social[kind] = item["url"]
    return social


# ── Login wall (Instagram/Facebook) ─────────────────────────────────────────

_LOGIN_WALL_MARKERS = (
    "log into facebook", "you must log in", "entrar no facebook",
    "login • instagram", "log in • instagram", "faça login para ver fotos",
    "accounts/login", "create new account",
)


def detect_login_wall(html: str) -> bool:
    lowered = (html or "").lower()
    return any(marker in lowered for marker in _LOGIN_WALL_MARKERS)


def extract_social_bio_contacts(html: str) -> dict:
    """Contatos visíveis sem login numa bio pública (Instagram/Facebook)."""
    text = Selector(html).get_all_text() if html else ""
    return {
        "whatsapps": extract_whatsapp_numbers(html),
        "phones": extract_phones_from_text(text),
        "emails": extract_emails_from_text(text),
    }


# ── Google Maps (fase de busca de lugar) ────────────────────────────────────
#
# O HTML de resultado de busca do Maps muda com frequência. Usamos âncoras
# relativamente estáveis: `data-item-id="authority"` (site oficial) e
# `data-item-id^="phone:tel:"` (telefone), além de `aria-label` para nome e
# nota. Isso é o ponto mais frágil do enriquecedor — ver README.

_MAPS_STATUS_MARKERS = (
    "fechado permanentemente", "fechado temporariamente", "aberto",
    "closed", "open",
)


def parse_maps_place(html: str, url: str) -> Optional[dict]:
    """Extrai o primeiro lugar de uma página de busca/lugar do Google Maps.

    Devolve um dict no formato do campo `maps` de RadarEnrichmentData (sem
    `url`, que é responsabilidade de quem chama) mais `phone`/`website` soltos
    (que não fazem parte do contrato `maps`, mas alimentam `telefones` e
    `website` do resultado geral), ou None se nada foi reconhecível.
    """
    sel = Selector(html)

    website = None
    for el in sel.css('a[data-item-id="authority"]'):
        href = el.attrib.get("href")
        if href:
            website = href
            break

    phone = None
    for el in sel.css('[data-item-id^="phone:tel:"]'):
        item_id = el.attrib.get("data-item-id", "")
        m = re.search(r"phone:tel:([\d+()\-.\s]+)", item_id)
        if m:
            phone = normalize_phone(m.group(1))
            if phone:
                break
    if phone is None:
        # fallback: âncora de telefone às vezes vem só no aria-label do botão.
        for aria in sel.css('button[aria-label]::attr(aria-label)').getall():
            if aria and ("telefone" in aria.lower() or "phone" in aria.lower()):
                candidate = normalize_phone(aria)
                if candidate:
                    phone = candidate
                    break

    nome = None
    nota = None
    avaliacoes = None
    for aria in sel.css("[aria-label]::attr(aria-label)").getall():
        if not aria:
            continue
        m = re.match(r"^\s*([\d.,]+)\s*(?:estrelas|stars)[^\d(]*\(?([\d.,]+)?", aria, re.IGNORECASE)
        if m:
            try:
                nota = float(m.group(1).replace(",", "."))
            except ValueError:
                nota = None
            if m.group(2):
                try:
                    avaliacoes = int(re.sub(r"\D", "", m.group(2)))
                except ValueError:
                    avaliacoes = None
            break
    # Nome: primeiro h1 (página de lugar) ou primeiro aria-label "grande" que
    # não seja de botão de ação conhecido.
    h1_text = sel.css("h1::text").get()
    if h1_text:
        nome = h1_text.strip()
    else:
        for aria in sel.css("a.hfpxzc::attr(aria-label)").getall():
            if aria:
                nome = aria.strip()
                break

    categoria = None
    cat = sel.css('button[jsaction*="category"]::text').get()
    if cat:
        categoria = cat.strip()

    endereco = None
    for el in sel.css('[data-item-id="address"]::attr(aria-label)').getall():
        if el:
            # remove um rótulo inicial tipo "Endereço:"/"Endereco:"/"Address:"
            endereco = re.sub(r"^[A-Za-zÀ-ÿ]+:\s*", "", el).strip()
            break
    if endereco is None:
        addr_button = sel.css('button[data-item-id="address"] div.fontBodyMedium::text').get()
        if addr_button:
            endereco = addr_button.strip()

    situacao = None
    full_text = sel.get_all_text().lower()
    for marker in _MAPS_STATUS_MARKERS:
        if marker in full_text:
            situacao = marker
            break

    if not nome and not website and not phone and not endereco:
        return None

    return {
        "nome": nome,
        "categoria": categoria,
        "nota": nota,
        "avaliacoes": avaliacoes,
        "situacao": situacao,
        "endereco": endereco,
        "website": website,
        "phone": phone,
    }


def matches_company(
    place_name: Optional[str],
    address: Optional[str],
    company_name: str,
    city_name: str,
) -> bool:
    """O lugar achado no Maps é mesmo a empresa buscada?

    Casa por sobreposição de tokens do nome, OU pela cidade aparecer no
    endereço — qualquer um dos dois é suficiente (o Maps às vezes só tem o
    nome fantasia, ou só a razão social).
    """
    company_tokens = set(normalize_name_tokens(company_name))
    if place_name and company_tokens:
        place_tokens = set(normalize_name_tokens(place_name))
        if company_tokens & place_tokens:
            return True
    if address and city_name:
        if normalize_text_loose(city_name).strip() in normalize_text_loose(address):
            return True
    return False


# ── Montagem do resultado final (RadarEnrichmentData) ───────────────────────

RADAR_ENRICH_SOURCES = ("busca", "site", "maps", "social")


def make_found(value: str, source: str, url: Optional[str]) -> dict:
    return {"value": value, "source": source, "url": url}


def cap_dedupe_found(items: list[dict], limit: int = 5) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for item in items:
        if item["value"] in seen:
            continue
        seen.add(item["value"])
        out.append(item)
        if len(out) >= limit:
            break
    return out


def empty_result() -> dict:
    return {
        "website": None,
        "maps": None,
        "whatsapps": [],
        "telefones": [],
        "emails": [],
        "instagram": None,
        "facebook": None,
        "fontes": [],
    }


def add_fonte(result: dict, source: str, ok: bool, note: Optional[str] = None) -> None:
    result["fontes"].append({"source": source, "ok": ok, "note": note})


def finalize_result(result: dict) -> dict:
    result["whatsapps"] = cap_dedupe_found(result["whatsapps"])
    result["telefones"] = cap_dedupe_found(result["telefones"])
    result["emails"] = cap_dedupe_found(result["emails"])
    return result


# ── Validação de forma (usada nos testes, e útil para depuração) ───────────

_FOUND_KEYS = {"value", "source", "url"}
_FONTE_KEYS = {"source", "ok", "note"}
_MAPS_KEYS = {"url", "nome", "categoria", "nota", "avaliacoes", "situacao", "endereco"}
_TOP_KEYS = {
    "website", "maps", "whatsapps", "telefones", "emails",
    "instagram", "facebook", "fontes",
}


def validate_enrichment_shape(data: dict) -> list[str]:
    """Confere se `data` bate com RadarEnrichmentData (shared/radar.ts).

    Devolve uma lista de problemas; lista vazia = válido.
    """
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["não é um dict"]

    missing = _TOP_KEYS - data.keys()
    if missing:
        errors.append(f"faltam campos: {sorted(missing)}")
    extra = data.keys() - _TOP_KEYS
    if extra:
        errors.append(f"campos a mais: {sorted(extra)}")

    if "website" in data and data["website"] is not None and not isinstance(data["website"], str):
        errors.append("website deve ser string ou null")

    if "maps" in data and data["maps"] is not None:
        maps_val = data["maps"]
        if not isinstance(maps_val, dict):
            errors.append("maps deve ser dict ou null")
        else:
            missing_maps = _MAPS_KEYS - maps_val.keys()
            if missing_maps:
                errors.append(f"maps: faltam campos {sorted(missing_maps)}")
            extra_maps = maps_val.keys() - _MAPS_KEYS
            if extra_maps:
                errors.append(f"maps: campos a mais {sorted(extra_maps)}")
            if "url" in maps_val and not isinstance(maps_val["url"], str):
                errors.append("maps.url deve ser string")

    for list_field in ("whatsapps", "telefones", "emails"):
        values = data.get(list_field)
        if not isinstance(values, list):
            errors.append(f"{list_field} deve ser lista")
            continue
        for item in values:
            if not isinstance(item, dict) or set(item.keys()) != _FOUND_KEYS:
                errors.append(f"{list_field}: item com formato errado: {item!r}")
                continue
            if item["source"] not in RADAR_ENRICH_SOURCES:
                errors.append(f"{list_field}: source inválido {item['source']!r}")

    for field in ("instagram", "facebook"):
        if field in data and data[field] is not None and not isinstance(data[field], str):
            errors.append(f"{field} deve ser string ou null")

    fontes = data.get("fontes")
    if not isinstance(fontes, list):
        errors.append("fontes deve ser lista")
    else:
        for item in fontes:
            if not isinstance(item, dict) or set(item.keys()) != _FONTE_KEYS:
                errors.append(f"fontes: item com formato errado: {item!r}")
                continue
            if item["source"] not in RADAR_ENRICH_SOURCES:
                errors.append(f"fontes: source inválido {item['source']!r}")
            if not isinstance(item["ok"], bool):
                errors.append("fontes: ok deve ser bool")

    return errors
