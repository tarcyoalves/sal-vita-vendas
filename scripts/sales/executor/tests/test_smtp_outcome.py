"""Classificação do resultado do SMTP — a fronteira que evita e-mail duplicado."""

import smtplib
import socket
import unittest
from unittest import mock

import helpers
from helpers import FakeSmtp, make_cfg, autorizacao

import despacho


def enviar(**plano):
    FakeSmtp.reset(**plano)
    cfg = make_cfg()
    msg, para = despacho.montar_mensagem(cfg, autorizacao())
    with mock.patch.object(despacho.smtplib, "SMTP", FakeSmtp):
        return despacho.enviar_smtp(cfg, msg, para)


class ResultadoSmtp(unittest.TestCase):
    def test_2xx_depois_do_data_e_aceita(self):
        r = enviar()
        self.assertEqual(r.outcome, "ACCEPTED")
        self.assertTrue(r.data_emitido)
        self.assertIn("250", r.resposta)

    def test_erro_no_quit_depois_do_2xx_continua_aceita(self):
        r = enviar(quit=smtplib.SMTPServerDisconnected("caiu no quit"))
        self.assertEqual(r.outcome, "ACCEPTED")

    def test_4xx_no_fim_do_data_e_temporaria(self):
        r = enviar(data=smtplib.SMTPDataError(451, b"4.3.0 try later"))
        self.assertEqual(r.outcome, "RETRYABLE_FAILURE")

    def test_5xx_no_fim_do_data_e_permanente(self):
        r = enviar(data=smtplib.SMTPDataError(554, b"5.7.1 rejected"))
        self.assertEqual(r.outcome, "PERMANENT_FAILURE")

    def test_5xx_no_rcpt_e_permanente_e_4xx_e_temporaria(self):
        self.assertEqual(enviar(rcpt_resp=(550, b"5.1.1 user unknown")).outcome, "PERMANENT_FAILURE")
        self.assertEqual(enviar(rcpt_resp=(451, b"4.2.1 mailbox busy")).outcome, "RETRYABLE_FAILURE")

    def test_5xx_no_mail_from_nao_e_permanente(self):
        # remetente rejeitado é problema nosso, não do destinatário
        r = enviar(mail_resp=(550, b"5.7.1 sender not allowed"))
        self.assertEqual(r.outcome, "RETRYABLE_FAILURE")
        self.assertFalse(r.data_emitido)

    def test_queda_de_conexao_depois_do_data_e_desconhecida(self):
        r = enviar(data=smtplib.SMTPServerDisconnected("Connection unexpectedly closed"))
        self.assertEqual(r.outcome, "UNKNOWN")
        self.assertTrue(r.data_emitido)

    def test_timeout_depois_do_data_e_desconhecido(self):
        self.assertEqual(enviar(data=socket.timeout("timed out")).outcome, "UNKNOWN")

    def test_resposta_inesperada_depois_do_data_e_desconhecida(self):
        self.assertEqual(enviar(data=smtplib.SMTPDataError(354, b"estranho")).outcome, "UNKNOWN")
        self.assertEqual(enviar(data=RuntimeError("bug")).outcome, "UNKNOWN")

    def test_falhas_antes_do_data_sao_temporarias(self):
        for onde, erro in (
            ("conectar", ConnectionRefusedError("recusou")),
            ("ehlo", smtplib.SMTPServerDisconnected("x")),
            ("starttls", smtplib.SMTPNotSupportedError("sem STARTTLS")),
            ("auth", socket.timeout("timeout no login")),
        ):
            with self.subTest(onde=onde):
                r = enviar(**{onde: erro})
                self.assertEqual(r.outcome, "RETRYABLE_FAILURE")
                self.assertFalse(r.data_emitido)

    def test_falha_de_autenticacao_e_temporaria_mas_sinalizada(self):
        r = enviar(auth=smtplib.SMTPAuthenticationError(535, b"5.7.8 bad credentials"))
        self.assertEqual(r.outcome, "RETRYABLE_FAILURE")
        self.assertTrue(r.falha_autenticacao)

    def test_nunca_envia_sem_starttls(self):
        r = enviar(starttls=smtplib.SMTPNotSupportedError("sem STARTTLS"))
        self.assertNotIn("data", FakeSmtp.instancias[0].etapas)
        self.assertEqual(r.outcome, "RETRYABLE_FAILURE")


class Montagem(unittest.TestCase):
    def test_cabecalhos_e_utf8(self):
        cfg = make_cfg()
        msg, para = despacho.montar_mensagem(cfg, autorizacao(corpo="Olá, açúcar não! Sal marinho."))
        self.assertEqual(msg["Message-ID"], "<abc123@salvita.invalid>")
        self.assertIn("List-Unsubscribe", msg)
        self.assertIn("vendas@salvita.invalid", msg["From"])
        self.assertEqual(msg["Reply-To"], "vendas@salvita.invalid")
        self.assertEqual(msg.get_content_type(), "text/plain")
        self.assertEqual(msg.get_content_charset(), "utf-8")
        self.assertIn("Olá, açúcar", msg.get_content())

    def test_recusa_sem_list_unsubscribe_ou_com_hash_errado(self):
        cfg = make_cfg()
        with self.assertRaises(despacho.MensagemInvalida):
            despacho.montar_mensagem(cfg, autorizacao(cabecalhos={}))
        with self.assertRaises(despacho.MensagemInvalida):
            despacho.montar_mensagem(cfg, autorizacao(contentHash="0" * 64))

    def test_servidor_nao_sobrescreve_cabecalhos_criticos_nem_injeta_linhas(self):
        cfg = make_cfg()
        msg, _ = despacho.montar_mensagem(cfg, autorizacao(cabecalhos={
            "List-Unsubscribe": "<mailto:sair@x.invalid>", "From": "falso@x.invalid"}))
        self.assertIn("vendas@salvita.invalid", msg["From"])
        with self.assertRaises(despacho.MensagemInvalida):
            despacho.montar_mensagem(cfg, autorizacao(cabecalhos={"List-Unsubscribe": "x\r\nBcc: a@b.invalid"}))


if __name__ == "__main__":
    unittest.main()
