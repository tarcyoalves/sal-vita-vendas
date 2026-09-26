"""
Configuração do enriquecedor — tudo lido do ambiente, nada hardcoded que
precise mudar por instalação. Sem valores sensíveis neste arquivo (o
repositório é público): `DATABASE_URL` vem só do ambiente.
"""

from __future__ import annotations

import os
from pathlib import Path

# ── Banco ────────────────────────────────────────────────────────────────

# Lido só do ambiente — nunca coloque a connection string num arquivo do
# repositório. Ver README.md para como configurar na VPS.
DATABASE_URL = os.environ.get("DATABASE_URL")

# ── Municípios (para trocar código IBGE por nome de cidade/UF) ──────────────

_THIS_DIR = Path(__file__).resolve().parent
_DEFAULT_MUNICIPIOS_PATH = _THIS_DIR / ".." / ".." / ".." / "server" / "data" / "municipios.json"
MUNICIPIOS_JSON_PATH = Path(
    os.environ.get("RADAR_MUNICIPIOS_JSON", str(_DEFAULT_MUNICIPIOS_PATH))
).resolve()

# ── Fila ─────────────────────────────────────────────────────────────────

MAX_ATTEMPTS = 3
# Precisa bater com RADAR_ENRICH_TTL_DAYS em shared/radar.ts.
ENRICH_TTL_DAYS = int(os.environ.get("RADAR_ENRICH_TTL_DAYS", "30"))
# Precisa bater com RADAR_ENRICHER_HEARTBEAT_KEY em shared/radar.ts.
HEARTBEAT_KEY = "radar_enricher_heartbeat"

# Segundos de espera quando a fila está vazia.
POLL_IDLE_SECONDS = float(os.environ.get("RADAR_ENRICH_POLL_SECONDS", "5"))

# ── Fontes ───────────────────────────────────────────────────────────────

ALL_SOURCES = ("busca", "site", "maps", "social")

# Nomes separados por vírgula em ENRICH_DISABLE, ex.: "maps,social".
DISABLED_SOURCES = {
    s.strip() for s in os.environ.get("ENRICH_DISABLE", "").split(",") if s.strip()
}

# Intervalo mínimo entre requisições de cada fonte (educação / anti-bloqueio).
RATE_LIMIT_SECONDS = {
    "busca": float(os.environ.get("RADAR_ENRICH_RATE_BUSCA", "4")),
    "maps": float(os.environ.get("RADAR_ENRICH_RATE_MAPS", "20")),
    "social": float(os.environ.get("RADAR_ENRICH_RATE_SOCIAL", "15")),
    "site": float(os.environ.get("RADAR_ENRICH_RATE_SITE", "2")),
}
# Variação aleatória somada ao intervalo mínimo (jitter), em segundos.
RATE_LIMIT_JITTER_SECONDS = float(os.environ.get("RADAR_ENRICH_JITTER", "1.5"))

# Minutos que uma fonte fica pausada depois de um sinal de bloqueio
# (captcha/"tráfego incomum"/429/403).
CIRCUIT_BREAKER_PAUSE_MINUTES = float(
    os.environ.get("RADAR_ENRICH_BREAKER_MINUTES", "60")
)

# Site: quantas páginas de contato seguir a partir da home, e timeout por
# página.
MAX_CONTACT_PAGES = 2
PAGE_TIMEOUT_SECONDS = float(os.environ.get("RADAR_ENRICH_PAGE_TIMEOUT", "10"))
CONTACT_PAGE_KEYWORDS = (
    "contato", "fale-conosco", "fale_conosco", "faleconosco",
    "atendimento", "sobre",
)

# User-Agent honesto (não finge ser Googlebot nem outro rastreador). Pode ser
# customizado pelo dono via env — por exemplo para incluir um contato real.
# IMPORTANTE: manter só ASCII aqui. Cabeçalhos HTTP acentuados quebram a
# codificação de header do curl_cffi (usado por baixo do Scrapling) com um
# UnicodeDecodeError — já aconteceu durante o desenvolvimento deste robô.
USER_AGENT = os.environ.get(
    "RADAR_ENRICH_USER_AGENT",
    "Mozilla/5.0 (compatible; SalVitaRadarEnricher/1.0; "
    "+https://salvitarn.com.br)",
)

# Maps/social: Scrapling StealthyFetcher roda um browser de verdade — mais
# pesado, por isso a taxa de requisição é bem mais baixa que busca/site.
MAPS_HEADLESS = os.environ.get("RADAR_ENRICH_MAPS_HEADLESS", "true").lower() != "false"
