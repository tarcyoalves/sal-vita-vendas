"""Intervalo mínimo de 5 min, janela de operação (sem rede fora dela) e provedores proibidos."""

import os
import unittest
from datetime import datetime, timezone
from unittest import mock

import helpers  # noqa: F401  (ajusta o sys.path; precisa vir primeiro)
import config
import janela
import journal as journal_mod
import worker
from helpers import FakeApi, make_cfg

# Fortaleza = UTC-3, sem horário de verão.
MADRUGADA = datetime(2026, 11, 28, 3, 20, tzinfo=timezone.utc)   # 00:20 local
MANHA = datetime(2026, 11, 28, 12, 0, tzinfo=timezone.utc)       # 09:00 local
FIM = datetime(2026, 11, 28, 21, 0, tzinfo=timezone.utc)         # 18:00 local (fim exclusivo)
QUASE_FIM = datetime(2026, 11, 28, 20, 59, tzinfo=timezone.utc)  # 17:59 local

ENV_OK = {"SALES_API_URL": "https://crm.invalid", "SALES_HERMES_SECRET_READ": "x" * 20}


class Ciclo(unittest.TestCase):
    def test_padrao_e_5_min(self):
        self.assertEqual(config.load({}).cycle_seconds, 300)
        self.assertEqual(config.Config().cycle_seconds, 300)

    def test_abaixo_de_300_sobe_para_300_com_aviso(self):
        with self.assertLogs("sales.config", level="WARNING") as log:
            cfg = config.load({"SALES_CYCLE_SECONDS": "60"})
        self.assertEqual(cfg.cycle_seconds, 300)
        self.assertIn("mínimo", "\n".join(log.output))

    def test_acima_de_300_e_respeitado(self):
        self.assertEqual(config.load({"SALES_CYCLE_SECONDS": "900"}).cycle_seconds, 900)

    def test_validate_recusa_ciclo_curto_montado_a_mao(self):
        erros = config.validate(make_cfg(cycle_seconds=60))
        self.assertTrue(any("SALES_CYCLE_SECONDS" in e for e in erros))


class Janela(unittest.TestCase):
    def test_padrao_08_18_fortaleza_com_fim_exclusivo(self):
        self.assertEqual(config.load({}).janela, "08:00-18:00")
        self.assertFalse(janela.dentro(MADRUGADA, None))
        self.assertTrue(janela.dentro(MANHA, None))
        self.assertTrue(janela.dentro(QUASE_FIM, None))
        self.assertFalse(janela.dentro(FIM, None))

    def test_varias_faixas_e_sempre(self):
        cfg = "08:00-11:00,14:00-17:00"
        self.assertTrue(janela.dentro(MANHA, cfg))
        self.assertFalse(janela.dentro(datetime(2026, 11, 28, 14, 30, tzinfo=timezone.utc), cfg))  # 11:30
        self.assertTrue(janela.dentro(MADRUGADA, "sempre"))

    def test_config_invalida_recusa_iniciar_e_fica_fora(self):
        for ruim in ("8h-18h", "18:00-08:00", "25:00-26:00"):
            erros = config.validate(config.load({**ENV_OK, "SALES_JANELA": ruim}))
            self.assertTrue(any("SALES_JANELA" in e for e in erros), ruim)
            self.assertFalse(janela.dentro(MANHA, ruim))

    def test_fora_da_janela_nenhuma_chamada_a_api_nem_heartbeat(self):
        for dry in (True, False):
            api = FakeApi()
            ex = worker.Executor(make_cfg(dry_run=dry, janela="08:00-18:00"), api,
                                 journal_mod.Journal(":memory:", trava=False), agora=lambda: MADRUGADA)
            with self.assertLogs("sales.worker", level="INFO") as log:
                self.assertFalse(ex.ciclo())
            self.assertEqual(api.chamadas, [])
            self.assertIn("fora da janela", "\n".join(log.output))

    def test_fora_da_janela_loga_uma_vez_por_hora(self):
        relogio = [0.0]
        ex = worker.Executor(make_cfg(dry_run=True, janela="08:00-18:00"), FakeApi(),
                             journal_mod.Journal(":memory:", trava=False),
                             agora=lambda: MADRUGADA, monotonic=lambda: relogio[0])
        linhas = []
        for t in (0, 300, 600, 3599, 3600, 3900):
            relogio[0] = float(t)
            with self.assertLogs("sales.worker", level="DEBUG") as log:
                worker.logger.debug("marcador")
                ex.ciclo()
            linhas.append(sum("fora da janela" in o for o in log.output))
        self.assertEqual(linhas, [1, 0, 0, 0, 1, 0])

    def test_dentro_da_janela_chama_modo_e_heartbeat(self):
        api = FakeApi()
        ex = worker.Executor(make_cfg(dry_run=True, janela="08:00-18:00"), api,
                             journal_mod.Journal(":memory:", trava=False), agora=lambda: MANHA)
        self.assertTrue(ex.ciclo())
        self.assertEqual(api.nomes(), ["modo", "heartbeat"])


class ProvedoresProibidos(unittest.TestCase):
    def test_recusa_resend_brevo_sendinblue_sendgrid_no_smtp_e_no_imap(self):
        for host in ("smtp.resend.com", "smtp-relay.brevo.com", "smtp-relay.SENDINBLUE.com", "smtp.sendgrid.net"):
            for campo in ("smtp_host", "imap_host"):
                erros = config.validate(make_cfg(**{campo: host}))
                self.assertTrue(any("prospecção fria" in e for e in erros), f"{campo}={host}")

    def test_vale_tambem_em_dry_run(self):
        erros = config.validate(make_cfg(dry_run=True, smtp_host="smtp.resend.com"))
        self.assertTrue(any("SALES_SMTP_HOST" in e for e in erros))

    def test_caixa_propria_passa(self):
        self.assertEqual(config.validate(make_cfg(smtp_host="mail.salvita.invalid", imap_host="mail.salvita.invalid")), [])

    def test_main_recusa_iniciar_com_provedor_proibido(self):
        env = {**ENV_OK, "SALES_SMTP_HOST": "smtp.resend.com"}
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(worker, "configurar_log", lambda cfg: None), \
             self.assertLogs("sales.worker", level="ERROR") as log:
            self.assertEqual(worker.main(["--check"]), 2)
        self.assertIn("resend", "\n".join(log.output))


if __name__ == "__main__":
    unittest.main()
