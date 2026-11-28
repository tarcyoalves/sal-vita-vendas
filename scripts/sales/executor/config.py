"""
Configuração do executor de vendas — tudo lido do ambiente.

O repositório é público: nenhum valor sensível mora aqui. Segredos e senhas
vêm só do ambiente (arquivo fora do git, permissão 600 — ver README.md).
Os nomes das variáveis dos segredos do Hermes batem com `HERMES_SCOPES` em
`shared/sales.ts`.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Mapping

import janela as janela_mod

logger = logging.getLogger("sales.config")

VERSAO = "1.0.0"

# Nomes das variáveis de ambiente (iguais a HERMES_SCOPES em shared/sales.ts).
ENV_SECRET_DESPACHO = "SALES_HERMES_SECRET_DISPATCH"
ENV_SECRET_LEITURA = "SALES_HERMES_SECRET_READ"
ENV_SECRET_PROPOSTAS = "SALES_HERMES_SECRET_PROPOSE"

# Mesma regra de `executorIdSchema` (shared/sales.ts).
_EXECUTOR_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{3,64}$")

_FALSOS = {"0", "false", "no", "nao", "não", "off", "n"}

# Intervalo mínimo entre ciclos. Cada chamada à API acorda o Neon por >= 5 min (plano grátis =
# 100 CU-h/mês); a regra do projeto é nunca consultar em menos de 5 min (ESTADO-DO-PROJETO.md).
CICLO_MINIMO_SEGUNDOS = 300

# Resend e Brevo (e afins) proíbem prospecção fria nos termos de uso: a caixa do executor
# nunca pode ser um desses provedores (docs/SALES-AI.md, regra 1).
PROVEDORES_PROIBIDOS = ("resend", "brevo", "sendinblue", "sendgrid")


def _ciclo(env: Mapping[str, str]) -> int:
    valor = _int(env, "SALES_CYCLE_SECONDS", CICLO_MINIMO_SEGUNDOS)
    if valor < CICLO_MINIMO_SEGUNDOS:
        logger.warning("SALES_CYCLE_SECONDS=%s abaixo do mínimo; usando %s s (nunca menos de 5 min)",
                       valor, CICLO_MINIMO_SEGUNDOS)
        return CICLO_MINIMO_SEGUNDOS
    return valor


def provedor_proibido(host: str) -> str | None:
    """Nome do provedor proibido contido no host (sem diferenciar maiúsculas), ou None."""
    h = host.strip().lower()
    return next((p for p in PROVEDORES_PROIBIDOS if p in h), None)


def _bool_dry_run(valor: str | None) -> bool:
    """DRY_RUN é o padrão. Só desliga com um "não" explícito; valor estranho = ligado."""
    if valor is None or valor.strip() == "":
        return True
    return valor.strip().lower() not in _FALSOS


def _int(env: Mapping[str, str], nome: str, padrao: int) -> int:
    bruto = env.get(nome, "").strip()
    if not bruto:
        return padrao
    try:
        return int(bruto)
    except ValueError:
        raise ValueError(f"{nome} precisa ser um número inteiro") from None


@dataclass(frozen=True)
class Config:
    api_url: str = ""
    secret_despacho: str = ""
    secret_leitura: str = ""
    secret_propostas: str = ""
    executor_id: str = "sales-executor-1"

    smtp_host: str = ""
    smtp_port: int = 587
    # "starttls" (porta 587) ou "ssl" (porta 465).
    smtp_security: str = "starttls"
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_timeout: float = 30.0

    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_first_days: int = 14
    imap_batch: int = 50

    from_name: str = "Sal Vita"
    from_address: str = ""
    reply_to: str = ""

    pacing_seconds: int = 180
    max_per_cycle: int = 5
    cycle_seconds: int = CICLO_MINIMO_SEGUNDOS
    # Janela de operação (fuso de Fortaleza). Fora dela, nenhuma chamada à API. Ver janela.py.
    janela: str = janela_mod.JANELA_PADRAO
    bounce_burst: int = 5
    permanent_streak_limit: int = 3

    dry_run: bool = True
    journal_path: str = "journal.sqlite3"
    api_timeout: float = 20.0

    def segredos(self) -> list[str]:
        """Valores que nunca podem aparecer em log (usado pelo filtro de redação)."""
        return [
            v for v in (
                self.secret_despacho, self.secret_leitura, self.secret_propostas,
                self.smtp_password, self.imap_password,
            ) if v
        ]

    def secret_para(self, escopo: str) -> str:
        return {
            "despacho": self.secret_despacho,
            "leitura": self.secret_leitura,
            "propostas": self.secret_propostas,
        }.get(escopo, "")


def load(env: Mapping[str, str] | None = None) -> Config:
    env = os.environ if env is None else env
    smtp_security = env.get("SALES_SMTP_SECURITY", "starttls").strip().lower() or "starttls"
    smtp_port_padrao = 465 if smtp_security == "ssl" else 587
    from_address = env.get("SALES_FROM_ADDRESS", "").strip()
    return Config(
        api_url=env.get("SALES_API_URL", "").strip().rstrip("/"),
        secret_despacho=env.get(ENV_SECRET_DESPACHO, "").strip(),
        secret_leitura=env.get(ENV_SECRET_LEITURA, "").strip(),
        secret_propostas=env.get(ENV_SECRET_PROPOSTAS, "").strip(),
        executor_id=env.get("SALES_EXECUTOR_ID", "sales-executor-1").strip(),
        smtp_host=env.get("SALES_SMTP_HOST", "").strip(),
        smtp_port=_int(env, "SALES_SMTP_PORT", smtp_port_padrao),
        smtp_security=smtp_security,
        smtp_user=env.get("SALES_SMTP_USER", "").strip(),
        smtp_password=env.get("SALES_SMTP_PASSWORD", ""),
        smtp_timeout=float(_int(env, "SALES_SMTP_TIMEOUT", 30)),
        imap_host=env.get("SALES_IMAP_HOST", "").strip(),
        imap_port=_int(env, "SALES_IMAP_PORT", 993),
        imap_user=env.get("SALES_IMAP_USER", "").strip(),
        imap_password=env.get("SALES_IMAP_PASSWORD", ""),
        imap_first_days=_int(env, "SALES_IMAP_FIRST_DAYS", 14),
        imap_batch=_int(env, "SALES_IMAP_BATCH", 50),
        from_name=env.get("SALES_FROM_NAME", "Sal Vita").strip() or "Sal Vita",
        from_address=from_address,
        reply_to=env.get("SALES_REPLY_TO", "").strip() or from_address,
        pacing_seconds=_int(env, "SALES_PACING_SECONDS", 180),
        max_per_cycle=_int(env, "SALES_MAX_PER_CYCLE", 5),
        cycle_seconds=_ciclo(env),
        janela=env.get("SALES_JANELA", "").strip() or janela_mod.JANELA_PADRAO,
        bounce_burst=_int(env, "SALES_BOUNCE_BURST", 5),
        permanent_streak_limit=_int(env, "SALES_PERMANENT_STREAK", 3),
        dry_run=_bool_dry_run(env.get("SALES_DRY_RUN")),
        journal_path=env.get("SALES_JOURNAL_PATH", "journal.sqlite3").strip() or "journal.sqlite3",
        api_timeout=float(_int(env, "SALES_API_TIMEOUT", 20)),
    )


def validate(cfg: Config) -> list[str]:
    """Erros que impedem o executor de rodar. Lista vazia = ok. Nunca inclui valores."""
    erros: list[str] = []
    if not cfg.api_url.startswith(("https://", "http://localhost", "http://127.0.0.1")):
        erros.append("SALES_API_URL precisa começar com https:// (http só para localhost)")
    if not cfg.secret_leitura:
        erros.append(f"{ENV_SECRET_LEITURA} ausente (necessário para /modo e heartbeat)")
    if not _EXECUTOR_ID_RE.match(cfg.executor_id):
        erros.append("SALES_EXECUTOR_ID inválido (3-64 caracteres: letras, números, . _ : -)")
    if cfg.pacing_seconds < 0 or cfg.max_per_cycle < 1 or cfg.max_per_cycle > 20:
        erros.append("SALES_PACING_SECONDS >= 0 e SALES_MAX_PER_CYCLE entre 1 e 20")
    if cfg.smtp_security not in ("starttls", "ssl"):
        erros.append("SALES_SMTP_SECURITY deve ser starttls ou ssl")
    if cfg.cycle_seconds < CICLO_MINIMO_SEGUNDOS:
        erros.append(f"SALES_CYCLE_SECONDS precisa ser >= {CICLO_MINIMO_SEGUNDOS} (5 min)")
    try:
        janela_mod.interpretar(cfg.janela)
    except ValueError as e:
        erros.append(str(e))
    for nome, host in (("SALES_SMTP_HOST", cfg.smtp_host), ("SALES_IMAP_HOST", cfg.imap_host)):
        proibido = provedor_proibido(host)
        if proibido:
            erros.append(f"{nome} aponta para {proibido}: Resend, Brevo, Sendinblue e SendGrid proíbem "
                         "prospecção fria. Use a caixa própria do domínio (docs/SALES-AI.md, regra 1)")
    if not cfg.dry_run:
        if not cfg.secret_despacho:
            erros.append(f"{ENV_SECRET_DESPACHO} ausente (necessário fora do DRY_RUN)")
        for nome, valor in (
            ("SALES_SMTP_HOST", cfg.smtp_host), ("SALES_SMTP_USER", cfg.smtp_user),
            ("SALES_SMTP_PASSWORD", cfg.smtp_password), ("SALES_FROM_ADDRESS", cfg.from_address),
            ("SALES_IMAP_HOST", cfg.imap_host), ("SALES_IMAP_USER", cfg.imap_user),
            ("SALES_IMAP_PASSWORD", cfg.imap_password),
        ):
            if not valor:
                erros.append(f"{nome} ausente (necessário fora do DRY_RUN)")
    return erros
