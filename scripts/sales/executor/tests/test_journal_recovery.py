"""Diário local: ordem das gravações, recuperação na partida e ausência de reenvio."""

import unittest
from unittest import mock

import helpers  # noqa: F401  (ajusta o sys.path; precisa vir primeiro)
import api as api_mod
import despacho
import journal as journal_mod
from helpers import FakeApi, make_cfg, autorizacao


def novo(cfg=None, api=None, smtp=None):
    cfg = cfg or make_cfg()
    api = api or FakeApi()
    j = journal_mod.Journal(":memory:", trava=False)
    smtp = smtp or mock.Mock(side_effect=AssertionError("SMTP não deveria ser chamado"))
    sleeps: list[float] = []
    d = despacho.Despachante(cfg, api, j, smtp_enviar=smtp, sleep=sleeps.append, agora=lambda: 1_000_000.0)
    return d, api, j, smtp, sleeps


class Recuperacao(unittest.TestCase):
    def test_dispatching_vira_unknown_e_nunca_reenvia(self):
        d, api, j, smtp, _ = novo()
        j.registrar_despacho("m1", 1, "<abc123@salvita.invalid>", "h", "a@b.invalid", "tok-1234567890123456")
        d.recuperar()
        d.informar_pendentes()
        self.assertEqual(api.chamadas, [("resultado", "m1", "UNKNOWN")])
        smtp.assert_not_called()
        row = j.db.execute("SELECT state, outcome FROM attempts").fetchone()
        self.assertEqual((row["state"], row["outcome"]), (journal_mod.REPORTED, "UNKNOWN"))
        self.assertTrue(j.ja_enviada(message_id="m1"))

    def test_resultado_aceito_nao_confirmado_e_reenviado_como_aceito(self):
        d, api, j, smtp, _ = novo()
        aid = j.registrar_despacho("m2", 1, "<x@y>", "h", "a@b.invalid", "tok-2234567890123456")
        j.gravar_resultado(aid, "ACCEPTED", "250 ok")
        d.recuperar()
        d.informar_pendentes()
        self.assertEqual(api.chamadas, [("resultado", "m2", "ACCEPTED")])
        smtp.assert_not_called()

    def test_servidor_fora_do_ar_mantem_pendente(self):
        api = FakeApi()
        api.resultado_resp = None
        d, api, j, _, _ = novo(api=api)
        aid = j.registrar_despacho("m3", 1, "<x@y>", "h", "a@b.invalid", "tok-3234567890123456")
        j.gravar_resultado(aid, "UNKNOWN", None)
        d.informar_pendentes()
        self.assertEqual(len(j.resultados_pendentes()), 1)

    def test_409_nao_fica_em_laco(self):
        api = FakeApi()
        api.resultado_resp = api_mod.Resposta(409, {"codigo": "conflito"})
        d, api, j, _, _ = novo(api=api)
        aid = j.registrar_despacho("m4", 1, "<x@y>", "h", "a@b.invalid", "tok-4234567890123456")
        j.gravar_resultado(aid, "ACCEPTED", None)
        d.informar_pendentes()
        self.assertEqual(j.resultados_pendentes(), [])
        self.assertEqual(d.contagens.get("conflitos"), 1)

    def test_mensagem_ja_enviada_localmente_nao_e_nem_autorizada(self):
        api = FakeApi()
        api.reservar_resp = api_mod.Resposta(200, {"mensagens": [
            {"messageId": "m5", "fence": 1, "reservaToken": "r" * 20, "reservadaAte": "x"}]})
        d, api, j, smtp, _ = novo(api=api)
        aid = j.registrar_despacho("m5", 1, "<x@y>", "h", "a@b.invalid", "tok-5234567890123456")
        j.gravar_resultado(aid, "UNKNOWN", None)
        j.marcar_informado(aid)
        d.ciclo()
        self.assertNotIn("autorizar", api.nomes())
        smtp.assert_not_called()


class FluxoCompleto(unittest.TestCase):
    def _api_com(self, n: int) -> FakeApi:
        api = FakeApi()
        api.reservar_resp = api_mod.Resposta(200, {"mensagens": [
            {"messageId": f"m{i}", "fence": 1, "reservaToken": "r" * 20, "reservadaAte": "x"} for i in range(n)]})
        api.autorizar_resp = [
            api_mod.Resposta(200, autorizacao(messageIdHeader=f"<id{i}@salvita.invalid>", despachoToken=f"tok-{i}" + "0" * 16))
            for i in range(n)]
        return api

    def test_diario_gravado_antes_do_smtp_e_ritmo_entre_envios(self):
        api = self._api_com(2)
        visto = []

        def smtp(cfg, msg, para):
            linhas = j.db.execute("SELECT state FROM attempts WHERE message_id_header=?", (msg["Message-ID"],)).fetchall()
            visto.append([r["state"] for r in linhas])
            return despacho.ResultadoSmtp("ACCEPTED", "250 ok", "data", data_emitido=True)

        relogio = [1_000_000.0]
        j = journal_mod.Journal(":memory:", trava=False)
        sleeps: list[float] = []
        d = despacho.Despachante(make_cfg(), api, j, smtp_enviar=smtp, sleep=sleeps.append, agora=lambda: relogio[0])
        d.ciclo()
        self.assertEqual(visto, [["DISPATCHING"], ["DISPATCHING"]])  # já estava no diário quando o SMTP rodou
        self.assertEqual(d.contagens["aceitas"], 2)
        self.assertEqual(len(sleeps), 1)  # só entre o 1º e o 2º envio
        self.assertAlmostEqual(sleeps[0], 180.0)
        self.assertEqual(j.resultados_pendentes(), [])
        # autorização vem imediatamente antes de cada envio, depois da espera
        self.assertEqual(api.nomes(), ["reservar", "autorizar", "resultado", "autorizar", "resultado"])

    def test_recusa_de_autorizacao_pula_sem_smtp(self):
        api = self._api_com(2)
        api.autorizar_resp[0] = api_mod.Resposta(403, {"codigo": "suprimido", "motivo": "x"})
        smtp = mock.Mock(return_value=despacho.ResultadoSmtp("ACCEPTED", "250", "data", data_emitido=True))
        d, api, j, smtp, _ = novo(api=api, smtp=smtp)
        d.ciclo()
        self.assertEqual(smtp.call_count, 1)
        self.assertEqual(d.contagens["recusadas"], 1)

    def test_423_encerra_o_ciclo(self):
        api = self._api_com(3)
        api.autorizar_resp[0] = api_mod.Resposta(423, {"codigo": "pausado", "motivo": "x"})
        smtp = mock.Mock()
        d, api, j, smtp, _ = novo(api=api, smtp=smtp)
        d.ciclo()
        smtp.assert_not_called()
        self.assertEqual(api.nomes().count("autorizar"), 1)

    def test_tres_falhas_permanentes_seguidas_param_o_despacho(self):
        api = self._api_com(5)
        smtp = mock.Mock(return_value=despacho.ResultadoSmtp("PERMANENT_FAILURE", "550 no", "rcpt"))
        d, api, j, smtp, _ = novo(api=api, smtp=smtp)
        d.ciclo()
        self.assertEqual(smtp.call_count, 3)
        self.assertIn("falhas permanentes", d.parada)
        d.ciclo()  # parado: não reserva de novo
        self.assertEqual(api.nomes().count("reservar"), 1)

    def test_aceita_zera_a_sequencia_de_permanentes(self):
        api = self._api_com(4)
        saidas = iter(["PERMANENT_FAILURE", "PERMANENT_FAILURE", "ACCEPTED", "PERMANENT_FAILURE"])
        smtp = mock.Mock(side_effect=lambda *a: despacho.ResultadoSmtp(next(saidas), "x", "data"))
        d, api, j, smtp, _ = novo(api=api, smtp=smtp)
        d.ciclo()
        self.assertIsNone(d.parada)

    def test_falha_de_autenticacao_smtp_para_e_persiste(self):
        api = self._api_com(3)
        smtp = mock.Mock(return_value=despacho.ResultadoSmtp("RETRYABLE_FAILURE", "535", "auth", falha_autenticacao=True))
        d, api, j, smtp, _ = novo(api=api, smtp=smtp)
        d.ciclo()
        self.assertEqual(smtp.call_count, 1)
        self.assertIn("autenticação", d.parada)

    def test_unknown_encerra_o_ciclo_e_e_informado(self):
        api = self._api_com(3)
        smtp = mock.Mock(return_value=despacho.ResultadoSmtp("UNKNOWN", "caiu", "data", data_emitido=True))
        d, api, j, smtp, _ = novo(api=api, smtp=smtp)
        d.ciclo()
        self.assertEqual(smtp.call_count, 1)
        self.assertIn(("resultado", "m0", "UNKNOWN"), api.chamadas)
        self.assertEqual(d.contagens["desconhecidas"], 1)

    def test_mensagem_invalida_nao_chega_ao_smtp_e_libera_no_servidor(self):
        api = self._api_com(1)
        api.autorizar_resp[0] = api_mod.Resposta(200, autorizacao(cabecalhos={}))
        d, api, j, smtp, _ = novo(api=api)
        d.ciclo()
        smtp.assert_not_called()
        self.assertIn(("resultado", "m0", "RETRYABLE_FAILURE"), api.chamadas)

    def test_401_da_api_propaga(self):
        api = self._api_com(1)

        def boom(*a):
            raise api_mod.ApiAuthError("401")
        api.autorizar = boom
        d, *_ = novo(api=api)
        with self.assertRaises(api_mod.ApiAuthError):
            d.ciclo()


if __name__ == "__main__":
    unittest.main()
