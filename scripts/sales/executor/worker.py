"""
Executor de vendas (Sal Vita Sales AI) — roda na VPS do dono, fora da Vercel.

Cada ciclo:
  1. (ao vivo) reenvia ao servidor resultados ainda não confirmados do diário local;
  2. (ao vivo) varre a caixa de entrada (somente leitura) e informa devoluções, respostas
     automáticas, pedidos para sair e respostas humanas;
  3. GET /modo: se o modo for DRY_RUN/PAUSED, o canal estiver desligado ou a política não
     estiver aprovada, NÃO despacha;
  4. reserva -> autoriza -> diário -> SMTP -> resultado, uma mensagem por vez, no ritmo;
  5. heartbeat.

Em DRY_RUN (o padrão) só faz GET /modo e heartbeat: nunca abre SMTP nem IMAP.

Uso:
  python3 worker.py              # laço contínuo (systemd)
  python3 worker.py --once       # um ciclo e sai
  python3 worker.py --check      # valida a configuração (sem imprimir valores) e sai
  python3 worker.py --liberar    # um humano libera uma parada de segurança (depois de conferir a causa)
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
from typing import Any

import api as api_mod
import caixa as caixa_mod
import config
import despacho as despacho_mod
import journal as journal_mod

logger = logging.getLogger("sales.worker")

MODOS_QUE_DESPACHAM = ("REVIEW", "SEMI_AUTONOMOUS", "AUTONOMOUS")
LIMITE_FALHAS_IMAP = 5


class _Redacao(logging.Filter):
    """Última linha de defesa: nenhum segredo configurado sai em log, mesmo por engano."""

    def __init__(self, segredos: list[str]) -> None:
        super().__init__()
        self._segredos = [s for s in segredos if len(s) >= 4]

    def filter(self, record: logging.LogRecord) -> bool:
        if self._segredos:
            msg = record.getMessage()
            for s in self._segredos:
                msg = msg.replace(s, "***")
            record.msg, record.args = msg, None
        return True


def configurar_log(cfg: config.Config) -> None:
    h = logging.StreamHandler(sys.stdout)  # o systemd manda para o journald
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    h.addFilter(_Redacao(cfg.segredos()))
    raiz = logging.getLogger()
    raiz.handlers[:] = [h]
    raiz.setLevel(logging.INFO)


def pode_despachar(resp: api_mod.Resposta) -> tuple[bool, str]:
    """Aplica a regra do passo 1: modo, canal e política."""
    if not resp.ok:
        return False, f"/modo respondeu HTTP {resp.status}"
    d = resp.dados
    modo = d.get("modo")
    canal = d.get("canal") or {}
    if modo not in MODOS_QUE_DESPACHAM:
        return False, f"modo {modo}"
    if canal.get("ativo") is not True:
        return False, "canal desligado"
    if canal.get("politicaAprovada") is not True:
        return False, "política não aprovada"
    return True, f"modo {modo}"


class Executor:
    def __init__(self, cfg: config.Config, api: api_mod.Api, journal: journal_mod.Journal,
                 stop: threading.Event | None = None, **kw: Any) -> None:
        self.cfg = cfg
        self.api = api
        self.journal = journal
        self.stop = stop or threading.Event()
        self.desp = despacho_mod.Despachante(cfg, api, journal, stop=self.stop, **kw.get("despacho", {}))
        self.caixa = caixa_mod.Caixa(cfg, api, journal, **kw.get("caixa", {}))
        self.n = 0

    def iniciar(self) -> None:
        # Recuperação local (sem rede, sem SMTP): DISPATCHING -> UNKNOWN. Nada é reenviado.
        self.desp.recuperar()

    # ── um ciclo ────────────────────────────────────────────────────────────

    def ciclo(self) -> None:
        self.n += 1
        self.desp.contagens = {}
        caixa_cont: dict[str, int] = {}
        try:
            if self.cfg.dry_run:
                self._ciclo_dry_run()
            else:
                caixa_cont = self._ciclo_ao_vivo()
        except api_mod.ApiAuthError as e:
            self._alerta_parada(f"API respondeu 401 / segredo inválido ({e})")
        except api_mod.ApiNetworkError as e:
            logger.warning("API inacessível neste ciclo: %s", e)
        except caixa_mod.ImapAuthError:
            self._alerta_parada("login IMAP recusado: sem ler a caixa não se envia")
        self._heartbeat(caixa_cont)

    def _alerta_parada(self, motivo: str) -> None:
        if self.cfg.dry_run:
            logger.error("ALERTA (DRY_RUN): %s", motivo)
        else:
            self.desp.parar(motivo)

    def _ciclo_dry_run(self) -> None:
        r = self.api.modo()  # única chamada de negócio em DRY_RUN
        ok, motivo = pode_despachar(r)
        limites = r.dados.get("limites") if r.ok else None
        logger.info("DRY_RUN: sem SMTP e sem IMAP. /modo: %s. Se estivesse ao vivo, %s. "
                    "Ritmo %ss, até %s por ciclo; limites do servidor: %s",
                    motivo, "despacharia" if ok else "NÃO despacharia",
                    self.cfg.pacing_seconds, self.cfg.max_per_cycle, limites)
        self.desp.contagens["dry_run"] = 1

    def _ciclo_ao_vivo(self) -> dict[str, int]:
        d = self.desp
        d.informar_pendentes()
        caixa_cont: dict[str, int] = {}
        if not d.parada and not self.stop.is_set():
            caixa_cont = self.caixa.varrer()
            if caixa_cont.get("DEVOLVIDO", 0) >= self.cfg.bounce_burst:
                d.parar(f"rajada de devoluções ({caixa_cont['DEVOLVIDO']} numa varredura)")
            if self.journal.meta_int("imap_falhas_seguidas") >= LIMITE_FALHAS_IMAP:
                d.parar(f"caixa de entrada ilegível há {LIMITE_FALHAS_IMAP} ciclos")
        if d.parada or self.stop.is_set():
            return caixa_cont
        ok, motivo = pode_despachar(self.api.modo())
        if not ok:
            logger.info("não despacha: %s", motivo)
            return caixa_cont
        d.ciclo()
        return caixa_cont

    def _heartbeat(self, caixa_cont: dict[str, int]) -> None:
        contagens: dict[str, int] = dict(self.desp.contagens)
        for k, v in caixa_cont.items():
            contagens[f"caixa_{k.lower()}"[:40]] = int(v)
        contagens["parado"] = 1 if self.desp.parada else 0
        contagens["dry_run"] = 1 if self.cfg.dry_run else 0
        contagens["diario_pendentes"] = self.journal.contagem_por_estado().get(journal_mod.RESULT_PENDING, 0)
        try:
            r = self.api.heartbeat(self.n, contagens)
            if not r.ok:
                logger.warning("heartbeat: HTTP %s", r.status)
        except api_mod.ApiAuthError as e:
            self._alerta_parada(f"heartbeat respondeu 401 ({e})")
        except api_mod.ApiNetworkError as e:
            logger.warning("heartbeat falhou: %s", e)
        logger.info("ciclo %d: %s", self.n, contagens)


# ── ponto de entrada ───────────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Executor de vendas Sal Vita")
    ap.add_argument("--once", action="store_true", help="roda um ciclo e sai")
    ap.add_argument("--check", action="store_true", help="valida a configuração e sai")
    ap.add_argument("--liberar", action="store_true", help="libera uma parada de segurança (ato humano)")
    args = ap.parse_args(argv)

    try:
        cfg = config.load()
    except ValueError as e:
        print(f"configuração inválida: {e}", file=sys.stderr)
        return 2
    configurar_log(cfg)
    erros = config.validate(cfg)
    if erros:
        for e in erros:
            logger.error("configuração: %s", e)
        return 2
    if args.check:
        logger.info("configuração ok (dry_run=%s, executor=%s)", cfg.dry_run, cfg.executor_id)
        return 0

    try:
        journal = journal_mod.Journal(cfg.journal_path)
    except journal_mod.JournalLockedError as e:
        logger.error("%s", e)
        return 3

    if args.liberar:
        for chave in ("parada", "falhas_permanentes_seguidas", "imap_falhas_seguidas"):
            journal.meta_del(chave)
        logger.info("parada liberada por um humano. Confira a causa antes de continuar.")
        return 0

    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())

    ex = Executor(cfg, api_mod.Api(cfg), journal, stop)
    logger.info("executor %s iniciado (versão %s, DRY_RUN=%s)", cfg.executor_id, config.VERSAO, cfg.dry_run)
    if cfg.dry_run:
        logger.warning("DRY_RUN LIGADO: nenhum e-mail será enviado nem lido. Para operar de verdade o dono "
                       "precisa definir SALES_DRY_RUN=0 (veja o README, seção de liberação).")
    ex.iniciar()
    try:
        while not stop.is_set():
            ex.ciclo()
            if args.once:
                break
            stop.wait(cfg.cycle_seconds)
    finally:
        journal.close()
        logger.info("executor encerrado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
