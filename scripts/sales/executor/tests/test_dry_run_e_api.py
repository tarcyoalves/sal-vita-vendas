"""DRY_RUN nunca abre SMTP/IMAP; cabeçalhos de autenticação por escopo; segredos fora do log."""

import io
import logging
import unittest
import urllib.error
from unittest import mock

import helpers  # noqa: F401  (ajusta o sys.path; precisa vir primeiro)
import api as api_mod
import config
import despacho
import journal as journal_mod
import worker
from helpers import (FakeApi, SEGREDO_DESPACHO, SEGREDO_LEITURA, SEGREDO_PROPOSTAS, make_cfg)


class DryRun(unittest.TestCase):
    def test_padrao_e_dry_run_e_so_desliga_com_nao_explicito(self):
        self.assertTrue(config.load({}).dry_run)
        self.assertTrue(config.load({"SALES_DRY_RUN": ""}).dry_run)
        self.assertTrue(config.load({"SALES_DRY_RUN": "talvez"}).dry_run)
        self.assertTrue(config.load({"SALES_DRY_RUN": "1"}).dry_run)
        self.assertFalse(config.load({"SALES_DRY_RUN": "0"}).dry_run)
        self.assertFalse(config.load({"SALES_DRY_RUN": "false"}).dry_run)

    def test_ciclo_em_dry_run_so_chama_modo_e_heartbeat_e_nao_abre_smtp_nem_imap(self):
        api = FakeApi()
        api.reservar = mock.Mock(side_effect=AssertionError("reservar não pode ser chamado em DRY_RUN"))
        j = journal_mod.Journal(":memory:", trava=False)
        # Mesmo uma tentativa pendente no diário não pode virar chamada de rede em DRY_RUN.
        aid = j.registrar_despacho("m1", 1, "<x@y>", "h", "a@b.invalid", "tok-1234567890123456")
        j.gravar_resultado(aid, "UNKNOWN", None)
        with mock.patch.object(despacho.smtplib, "SMTP") as smtp, \
             mock.patch.object(despacho.smtplib, "SMTP_SSL") as smtp_ssl, \
             mock.patch("imaplib.IMAP4_SSL") as imap, mock.patch("imaplib.IMAP4") as imap_plain:
            ex = worker.Executor(make_cfg(dry_run=True), api, j)
            ex.iniciar()
            ex.ciclo()
            smtp.assert_not_called()
            smtp_ssl.assert_not_called()
            imap.assert_not_called()
            imap_plain.assert_not_called()
        self.assertEqual(api.nomes(), ["modo", "heartbeat"])
        self.assertEqual(api.chamadas[1][2]["dry_run"], 1)
        self.assertNotIn("aceitas", api.chamadas[1][2])  # nada é informado como aceito

    def test_ao_vivo_mas_servidor_em_dry_run_nao_reserva(self):
        api = FakeApi()
        api.modo_resp = api_mod.Resposta(200, {"modo": "DRY_RUN", "canal": {"ativo": True, "politicaAprovada": True}})
        ex = worker.Executor(make_cfg(dry_run=False), api, journal_mod.Journal(":memory:", trava=False),
                             caixa={"imap_factory": mock.Mock(side_effect=OSError("sem rede"))})
        ex.ciclo()
        self.assertNotIn("reservar", api.nomes())
        self.assertEqual(api.nomes()[-1], "heartbeat")

    def test_pode_despachar_exige_modo_canal_e_politica(self):
        R = api_mod.Resposta
        ok = {"modo": "REVIEW", "canal": {"ativo": True, "politicaAprovada": True}}
        self.assertTrue(worker.pode_despachar(R(200, ok))[0])
        for ruim in (
            {**ok, "modo": "DRY_RUN"}, {**ok, "modo": "PAUSED"},
            {**ok, "canal": {"ativo": False, "politicaAprovada": True}},
            {**ok, "canal": {"ativo": True, "politicaAprovada": False}},
            {"modo": "AUTONOMOUS"}, {},
        ):
            self.assertFalse(worker.pode_despachar(R(200, ruim))[0], ruim)
        self.assertFalse(worker.pode_despachar(R(503, ok))[0])

    def test_rajada_de_devolucoes_para_o_despacho(self):
        api = FakeApi()
        j = journal_mod.Journal(":memory:", trava=False)
        ex = worker.Executor(make_cfg(dry_run=False, bounce_burst=2), api, j)
        ex.caixa.varrer = lambda: {"DEVOLVIDO": 2}
        ex.ciclo()
        self.assertIn("rajada", ex.desp.parada)
        self.assertNotIn("reservar", api.nomes())

    def test_401_ao_vivo_para(self):
        api = FakeApi()

        def boom():
            raise api_mod.ApiAuthError("401")
        api.modo = boom
        j = journal_mod.Journal(":memory:", trava=False)
        ex = worker.Executor(make_cfg(dry_run=False), api, j)
        ex.caixa.varrer = lambda: {}
        ex.ciclo()
        self.assertIn("401", ex.desp.parada)


class AutenticacaoPorEscopo(unittest.TestCase):
    def _api(self, status=200, corpo=b"{}"):
        capturadas = []

        class R:
            def __init__(s, st, c):
                s.status, s._c = st, c

            def read(s):
                return s._c

            def __enter__(s):
                return s

            def __exit__(s, *a):
                return False

        def opener(req, timeout=None):
            capturadas.append(req)
            return R(status, corpo)

        return api_mod.Api(make_cfg(), opener=opener), capturadas

    def test_cada_rota_usa_o_segredo_do_seu_escopo(self):
        a, cap = self._api()
        a.modo()
        a.heartbeat(1, {"x": 1})
        a.reservar(3)
        a.autorizar("m1", "r" * 20, 1)
        a.resultado("m1", "t" * 20, "ACCEPTED", "250 ok")
        a.evento_caixa({"idempotencyKey": "<a@b.invalid>", "tipo": "RESPOSTA", "email": "a@b.invalid"})
        a.proposta({"idempotencyKey": "x" * 10})
        esperado = [
            ("GET", "/api/sales/modo", SEGREDO_LEITURA),
            ("POST", "/api/sales/heartbeat", SEGREDO_LEITURA),
            ("POST", "/api/sales/fila/reservar", SEGREDO_DESPACHO),
            ("POST", "/api/sales/envio/m1/autorizar", SEGREDO_DESPACHO),
            ("POST", "/api/sales/envio/m1/resultado", SEGREDO_DESPACHO),
            ("POST", "/api/sales/caixa/eventos", SEGREDO_DESPACHO),
            ("POST", "/api/sales/propostas", SEGREDO_PROPOSTAS),
        ]
        obtido = [(r.get_method(), r.full_url.replace("https://crm.invalid", ""), r.get_header("Authorization")) for r in cap]
        self.assertEqual(obtido, [(m, p, f"Bearer {s}") for m, p, s in esperado])

    def test_corpos_seguem_o_contrato(self):
        import json
        a, cap = self._api()
        a.reservar(3)
        a.autorizar("m1", "r" * 20, 7)
        a.resultado("m1", "t" * 20, "UNKNOWN", None)
        corpos = [json.loads(r.data) for r in cap]
        self.assertEqual(corpos[0], {"executor": "exec-teste", "max": 3})
        self.assertEqual(corpos[1], {"executor": "exec-teste", "reservaToken": "r" * 20, "fence": 7})
        self.assertEqual(corpos[2], {"executor": "exec-teste", "despachoToken": "t" * 20, "resultado": "UNKNOWN"})

    def test_segredo_ausente_do_escopo_nao_envia_nada(self):
        a, cap = self._api()
        a.cfg = make_cfg(secret_propostas="")
        with self.assertRaises(api_mod.ApiAuthError):
            a.proposta({})
        self.assertEqual(cap, [])

    def test_401_vira_erro_de_autenticacao(self):
        a, _ = self._api(status=401)
        with self.assertRaises(api_mod.ApiAuthError):
            a.modo()

    def test_http_error_e_rede(self):
        def opener(req, timeout=None):
            raise urllib.error.HTTPError(req.full_url, 409, "conflito", {}, io.BytesIO(b'{"codigo":"x"}'))
        r = api_mod.Api(make_cfg(), opener=opener).modo()
        self.assertEqual((r.status, r.dados), (409, {"codigo": "x"}))

        def fora(req, timeout=None):
            raise urllib.error.URLError("sem rede")
        with self.assertRaises(api_mod.ApiNetworkError):
            api_mod.Api(make_cfg(), opener=fora).modo()

    def test_resultado_tenta_de_novo_com_backoff(self):
        esperas = []
        chamadas = []

        def opener(req, timeout=None):
            chamadas.append(1)
            raise urllib.error.URLError("fora")
        a = api_mod.Api(make_cfg(), opener=opener, sleep=esperas.append)
        self.assertIsNone(a.resultado_com_retentativa("m1", "t" * 20, "ACCEPTED", None, tentativas=4))
        self.assertEqual(len(chamadas), 4)
        self.assertEqual(esperas, [2.0, 4.0, 8.0])


class Segredos(unittest.TestCase):
    def test_filtro_de_log_remove_segredos(self):
        cfg = make_cfg()
        buf = io.StringIO()
        h = logging.StreamHandler(buf)
        h.addFilter(worker._Redacao(cfg.segredos()))
        lg = logging.getLogger("teste.redacao")
        lg.addHandler(h)
        lg.setLevel(logging.INFO)
        lg.info("erro com %s e %s", SEGREDO_DESPACHO, cfg.smtp_password)
        self.assertNotIn(SEGREDO_DESPACHO, buf.getvalue())
        self.assertNotIn(cfg.smtp_password, buf.getvalue())
        self.assertIn("***", buf.getvalue())

    def test_validate_nao_vaza_valores(self):
        erros = config.validate(config.load({"SALES_API_URL": "http://inseguro.invalid", "SALES_DRY_RUN": "0"}))
        self.assertTrue(erros)
        self.assertTrue(all("http://inseguro" not in e for e in erros))

    def test_dry_run_so_exige_segredo_de_leitura(self):
        env = {"SALES_API_URL": "https://crm.invalid", "SALES_HERMES_SECRET_READ": "x" * 20}
        self.assertEqual(config.validate(config.load(env)), [])
        self.assertTrue(config.validate(config.load({**env, "SALES_DRY_RUN": "0"})))


if __name__ == "__main__":
    unittest.main()
