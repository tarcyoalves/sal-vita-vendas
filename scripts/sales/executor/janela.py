"""
Janela de operação do executor (economia de computação do Neon).

Fora da janela o executor NÃO chama a API (nem /modo, nem heartbeat) e não lê a caixa:
cada chamada acorda o banco por pelo menos 5 min. Mesmo raciocínio do robô SMBI
(`shared/smbiJanela.ts`): fuso fixo America/Fortaleza (sem horário de verão), todos os
dias da semana, fim EXCLUSIVO (17:00 já está fora).

Config (SALES_JANELA): "08:00-11:00,14:00-17:00" (padrão, a mesma do robô SMBI), outras faixas
separadas por vírgula ("08:00-18:00") ou "sempre" (desliga o portão). Diferente do SMBI, config
inválida NÃO vira "sempre": o executor recusa iniciar (falha fechada).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

JANELA_PADRAO = "08:00-11:00,14:00-17:00"  # a mesma do robô SMBI (shared/smbiJanela.ts)
FUSO_NOME = "America/Fortaleza"

try:  # zoneinfo é da biblioteca padrão (3.9+), mas pode faltar o tzdata no sistema.
    from zoneinfo import ZoneInfo

    FUSO = ZoneInfo(FUSO_NOME)
except Exception:  # pragma: no cover - depende do sistema
    FUSO = timezone(timedelta(hours=-3), FUSO_NOME)  # Fortaleza não tem horário de verão

_RE_FAIXA = re.compile(r"^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$")


def interpretar(config: str | None) -> list[tuple[int, int]] | None:
    """Faixas em minutos desde 00:00 local; `None` = sempre. Config inválida levanta ValueError."""
    txt = (config or "").strip() or JANELA_PADRAO
    if txt.lower() == "sempre":
        return None
    faixas: list[tuple[int, int]] = []
    for parte in txt.split(","):
        m = _RE_FAIXA.match(parte.strip())
        if not m:
            raise ValueError("SALES_JANELA inválida (formato: 08:00-18:00, faixas separadas por vírgula, ou sempre)")
        h1, m1, h2, m2 = (int(x) for x in m.groups())
        if h1 > 23 or h2 > 23 or m1 > 59 or m2 > 59:
            raise ValueError("SALES_JANELA inválida (hora acima de 23:59)")
        ini, fim = h1 * 60 + m1, h2 * 60 + m2
        if fim <= ini:
            raise ValueError("SALES_JANELA inválida (o fim de cada faixa precisa ser depois do início)")
        faixas.append((ini, fim))
    return sorted(faixas)


def minuto_local(agora: datetime) -> int:
    if agora.tzinfo is None:
        agora = agora.replace(tzinfo=timezone.utc)
    local = agora.astimezone(FUSO)
    return local.hour * 60 + local.minute


def dentro(agora: datetime, config: str | None) -> bool:
    """True se o executor pode trabalhar agora. Config inválida = fora (falha fechada)."""
    try:
        faixas = interpretar(config)
    except ValueError:
        return False
    if faixas is None:
        return True
    m = minuto_local(agora)
    return any(ini <= m < fim for ini, fim in faixas)
