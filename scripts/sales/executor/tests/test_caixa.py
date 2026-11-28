"""Caixa de entrada: classificação de e-mails reais (amostras cruas), limpeza de PII e varredura IMAP."""

import unittest
from email import message_from_bytes, policy

import helpers  # noqa: F401  (ajusta o sys.path; precisa vir primeiro)
import api as api_mod
import caixa
import journal as journal_mod
from helpers import FakeApi, make_cfg

ORIGINAL = "<orig-1@salvita.invalid>"
NOSSAS = {ORIGINAL: {"para": "compras@empresa.invalid"}}


def conhece(mid):
    return NOSSAS.get(mid)


def detectar(raw: str, **kw):
    b = raw.encode("utf-8")
    return caixa.detectar(message_from_bytes(b, policy=policy.default), b, conhece, kw.get("proprio", "vendas@salvita.invalid"))


DSN = """From: MAILER-DAEMON@mx.example.org
To: vendas@salvita.invalid
Subject: Undelivered Mail Returned to Sender
Message-ID: <dsn1@mx.example.org>
Date: Mon, 30 Nov 2026 10:00:00 +0000
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="BB"

--BB
Content-Type: text/plain; charset=utf-8

Nao foi possivel entregar.
--BB
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.org

Final-Recipient: rfc822; Compras@Empresa.invalid
Action: {acao}
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 <compras@empresa.invalid> user unknown

--BB
Content-Type: message/rfc822

Message-ID: <orig-1@salvita.invalid>
From: vendas@salvita.invalid
To: compras@empresa.invalid
Subject: Oi

corpo
--BB--
"""

AUTO = """From: Compras <compras@empresa.invalid>
To: vendas@salvita.invalid
Subject: Resposta automática: Caixa de sal
Message-ID: <auto1@empresa.invalid>
In-Reply-To: <orig-1@salvita.invalid>
Auto-Submitted: auto-replied
Content-Type: text/plain; charset=utf-8

Estou fora do escritório até segunda.
"""

AUTO_SO_ASSUNTO = """From: Compras <compras@empresa.invalid>
To: vendas@salvita.invalid
Subject: Out of Office: Caixa de sal
Message-ID: <auto2@empresa.invalid>
In-Reply-To: <orig-1@salvita.invalid>
Content-Type: text/plain; charset=utf-8

I am away.
"""

SAIR = """From: Fulano <fulano@outra.invalid>
To: vendas@salvita.invalid
Subject: Descadastrar
Message-ID: <sair1@outra.invalid>
Date: Tue, 01 Dec 2026 12:00:00 -0300
Content-Type: text/plain; charset=utf-8

Não quero receber mais esses e-mails. Por favor me remova da lista.
"""

SAIR_CURTO = """From: Compras <compras@empresa.invalid>
To: vendas@salvita.invalid
Subject: Re: Caixa de sal
Message-ID: <sair2@empresa.invalid>
In-Reply-To: <orig-1@salvita.invalid>
Content-Type: text/plain; charset=utf-8

Sair
"""

RESPOSTA = """From: Maria <maria.compras@empresa.invalid>
To: vendas@salvita.invalid
Subject: Re: Caixa de sal
Message-ID: <resp1@empresa.invalid>
In-Reply-To: <orig-1@salvita.invalid>
References: <outro@x.invalid> <orig-1@salvita.invalid>
Date: Tue, 01 Dec 2026 09:30:00 -0300
Content-Type: text/plain; charset=utf-8

Olá! Tenho interesse, qual o preço da caixa de 10 kg? Me liga no (84) 99999-1234
ou fale com o Jose: jose@terceiro.invalid. CNPJ 12.345.678/0001-95, CPF 123.456.789-09.
Vou sair para uma reunião às 15h e volto depois.

Em 30/11/2026, vendas@salvita.invalid escreveu:
> Olá, somos a Sal Vita
> texto citado que não deve ir
"""

NAO_RELACIONADO = """From: Newsletter <news@loja.invalid>
To: vendas@salvita.invalid
Subject: Ofertas da semana
Message-ID: <news1@loja.invalid>
List-Unsubscribe: <https://loja.invalid/sair>
Content-Type: text/plain; charset=utf-8

Aproveite! Para sair da lista clique aqui. Unsubscribe: https://loja.invalid/sair
"""


class Classificacao(unittest.TestCase):
    def test_devolucao_vira_devolvido(self):
        (ev,) = detectar(DSN.format(acao="failed"))
        self.assertEqual(ev["tipo"], "DEVOLVIDO")
        self.assertEqual(ev["email"], "compras@empresa.invalid")
        self.assertEqual(ev["emRespostaA"], ORIGINAL)
        self.assertEqual(ev["idempotencyKey"], "<dsn1@mx.example.org>")
        self.assertIn("5.1.1", ev["trecho"])
        self.assertNotIn("@", ev["trecho"])
        self.assertEqual(ev["recebidoEm"], "2026-11-30T10:00:00Z")

    def test_dsn_de_atraso_nao_e_devolucao_definitiva(self):
        self.assertEqual(detectar(DSN.format(acao="delayed")), [])

    def test_resposta_automatica_por_cabecalho_e_por_assunto(self):
        for raw in (AUTO, AUTO_SO_ASSUNTO):
            (ev,) = detectar(raw)
            self.assertEqual(ev["tipo"], "AUTO_RESPOSTA")
            self.assertEqual(ev["email"], "compras@empresa.invalid")
            self.assertEqual(ev["emRespostaA"], ORIGINAL)
            self.assertNotIn("trecho", ev)

    def test_pedido_para_sair_sem_vinculo(self):
        (ev,) = detectar(SAIR)
        self.assertEqual(ev["tipo"], "PEDIU_PARA_SAIR")
        self.assertEqual(ev["email"], "fulano@outra.invalid")
        self.assertEqual(ev["idempotencyKey"], "<sair1@outra.invalid>")

    def test_sair_curto_vinculado_e_prioridade_sobre_resposta(self):
        (ev,) = detectar(SAIR_CURTO)
        self.assertEqual(ev["tipo"], "PEDIU_PARA_SAIR")
        self.assertEqual(ev["emRespostaA"], ORIGINAL)

    def test_sair_em_resposta_longa_nao_e_pedido_de_descadastro(self):
        (ev,) = detectar(RESPOSTA)
        self.assertEqual(ev["tipo"], "RESPOSTA")

    def test_resposta_humana_com_in_reply_to(self):
        (ev,) = detectar(RESPOSTA)
        self.assertEqual(ev["tipo"], "RESPOSTA")
        self.assertEqual(ev["email"], "compras@empresa.invalid")  # destinatário original, não o alias
        self.assertEqual(ev["emRespostaA"], ORIGINAL)
        self.assertEqual(ev["idempotencyKey"], "<resp1@empresa.invalid>")
        self.assertNotIn("classificacao", ev)  # sem gancho, sem classificação
        t = ev["trecho"]
        self.assertLessEqual(len(t), 600)
        self.assertIn("qual o preço", t)
        self.assertNotIn("texto citado", t)
        for proibido in ("99999", "1234", "jose@", "terceiro", "12.345.678", "123.456.789", "@"):
            self.assertNotIn(proibido, t)

    def test_nao_relacionado_e_ignorado(self):
        self.assertEqual(detectar(NAO_RELACIONADO), [])

    def test_rodape_de_boletim_sem_cabecalho_tambem_nao_e_pedido(self):
        raw = NAO_RELACIONADO.replace("List-Unsubscribe: <https://loja.invalid/sair>\n", "")
        raw += "Texto longo de promoção. " * 30
        self.assertEqual(detectar(raw), [])

    def test_mensagem_propria_e_ignorada(self):
        raw = RESPOSTA.replace("maria.compras@empresa.invalid", "vendas@salvita.invalid")
        self.assertEqual(detectar(raw), [])

    def test_gancho_de_classificacao_e_opcional_e_validado(self):
        self.assertIsNone(caixa.classificar)
        try:
            caixa.classificar = lambda texto: "pediu_preco"
            (ev,) = detectar(RESPOSTA)
            self.assertEqual(ev["classificacao"], "pediu_preco")
            caixa.classificar = lambda texto: "inventada"
            self.assertNotIn("classificacao", detectar(RESPOSTA)[0])
            caixa.classificar = lambda texto: 1 / 0
            self.assertEqual(detectar(RESPOSTA)[0]["tipo"], "RESPOSTA")
        finally:
            caixa.classificar = None

    def test_gancho_so_recebe_texto_limpo(self):
        vistos = []
        try:
            caixa.classificar = lambda texto: vistos.append(texto)
            detectar(RESPOSTA)
        finally:
            caixa.classificar = None
        self.assertEqual(len(vistos), 1)
        self.assertNotIn("99999", vistos[0])
        self.assertNotIn("jose@", vistos[0])


class LimpezaPii(unittest.TestCase):
    def test_remove_telefone_cpf_cnpj_e_emails(self):
        casos = {
            "Ligue (84) 99999-1234 agora": "99999",
            "whats +55 84 99999 1234": "99999",
            "wa.me/5584999991234": "5584999991234",
            "tel 8433221100": "33221100",
            "CPF 123.456.789-09": "123.456.789",
            "cpf 12345678909": "12345678909",
            "CNPJ 12.345.678/0001-95": "0001-95",
            "cnpj 12345678000195": "12345678000195",
            "escreva para fulano.tal+x@empresa.invalid": "fulano",
        }
        for entrada, sobra in casos.items():
            with self.subTest(entrada=entrada):
                self.assertNotIn(sobra, caixa.limpar_pii(entrada))

    def test_preserva_texto_comum_e_numeros_curtos(self):
        t = "Quero 20 caixas de 10 kg por R$ 1.500,00 até dia 15."
        self.assertEqual(caixa.limpar_pii(t), t)

    def test_trecho_nunca_passa_de_600(self):
        raw = RESPOSTA.split("Olá!")[0] + "Olá! " + ("palavra " * 400)
        (ev,) = detectar(raw)
        self.assertLessEqual(len(ev["trecho"]), 600)


class FakeImap:
    """IMAP de mentira: só o que o executor deve usar. STORE/EXPUNGE/APPEND não existem (AttributeError)."""

    def __init__(self, mensagens: dict[int, str], login_ok=True):
        self.mensagens = mensagens
        self.login_ok = login_ok
        self.log: list[tuple] = []

    def __call__(self, host, port, **kw):
        return self

    def login(self, u, p):
        import imaplib
        if not self.login_ok:
            raise imaplib.IMAP4.error("AUTHENTICATIONFAILED")
        self.log.append(("login",))

    def select(self, caixa_, readonly=False):
        self.log.append(("select", caixa_, readonly))
        return "OK", [b"1"]

    def response(self, nome):
        return nome, [b"777"]

    def uid(self, cmd, *args):
        self.log.append(("uid", cmd) + args)
        if cmd == "SEARCH":
            if args[0] == "UID":
                piso = int(args[1].split(":")[0])
                return "OK", [" ".join(str(u) for u in self.mensagens if u >= piso).encode()]
            return "OK", [" ".join(str(u) for u in self.mensagens).encode()]
        if cmd == "FETCH":
            return "OK", [(b"1 (UID 1 BODY[] {1}", self.mensagens[int(args[0])].encode("utf-8")), b")"]
        raise AssertionError(f"comando IMAP proibido: {cmd}")

    def logout(self):
        self.log.append(("logout",))


class Varredura(unittest.TestCase):
    def setUp(self):
        self.j = journal_mod.Journal(":memory:", trava=False)
        aid = self.j.registrar_despacho("m1", 1, ORIGINAL, "h", "compras@empresa.invalid", "tok-1234567890123456")
        self.j.gravar_resultado(aid, "ACCEPTED", "250")
        self.cfg = make_cfg()

    def test_somente_leitura_e_avanca_o_uid(self):
        imap = FakeImap({10: RESPOSTA, 11: NAO_RELACIONADO, 12: SAIR})
        api = FakeApi()
        cont = caixa.Caixa(self.cfg, api, self.j, imap_factory=imap).varrer()
        self.assertEqual(cont, {"RESPOSTA": 1, "ignoradas": 1, "PEDIU_PARA_SAIR": 1})
        self.assertIn(("select", "INBOX", True), imap.log)  # readonly
        fetches = [l for l in imap.log if l[:2] == ("uid", "FETCH")]
        self.assertTrue(all(l[3] == "(BODY.PEEK[])" for l in fetches))
        self.assertEqual(self.j.meta_get("imap_last_uid"), "12")
        # segunda varredura: nada novo (a busca UID 13:* não devolve nada)
        api2 = FakeApi()
        caixa.Caixa(self.cfg, api2, self.j, imap_factory=imap).varrer()
        self.assertEqual(api2.eventos, [])

    def test_falha_do_servidor_nao_avanca_o_uid(self):
        imap = FakeImap({10: RESPOSTA})
        api = FakeApi()
        api.evento_resp = api_mod.Resposta(503, {})
        caixa.Caixa(self.cfg, api, self.j, imap_factory=imap).varrer()
        self.assertIsNone(self.j.meta_get("imap_last_uid"))

    def test_evento_recusado_com_400_e_pulado(self):
        imap = FakeImap({10: RESPOSTA})
        api = FakeApi()
        api.evento_resp = api_mod.Resposta(400, {})
        caixa.Caixa(self.cfg, api, self.j, imap_factory=imap).varrer()
        self.assertEqual(self.j.meta_get("imap_last_uid"), "10")

    def test_login_recusado_levanta_erro_de_autenticacao(self):
        imap = FakeImap({}, login_ok=False)
        with self.assertRaises(caixa.ImapAuthError):
            caixa.Caixa(self.cfg, FakeApi(), self.j, imap_factory=imap).varrer()

    def test_401_da_api_propaga(self):
        imap = FakeImap({10: RESPOSTA})
        api = FakeApi()

        def boom(ev):
            raise api_mod.ApiAuthError("401")
        api.evento_caixa = boom
        with self.assertRaises(api_mod.ApiAuthError):
            caixa.Caixa(self.cfg, api, self.j, imap_factory=imap).varrer()


if __name__ == "__main__":
    unittest.main()
