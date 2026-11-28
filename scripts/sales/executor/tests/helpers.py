"""Apoio dos testes: caminho do pacote, configuração falsa, SMTP/API/IMAP de mentira."""

from __future__ import annotations

import os
import sys

EXECUTOR_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if EXECUTOR_DIR not in sys.path:
    sys.path.insert(0, EXECUTOR_DIR)

import api as api_mod  # noqa: E402
import config  # noqa: E402
import despacho  # noqa: E402

SEGREDO_DESPACHO = "seg-despacho-AAAA1111"
SEGREDO_LEITURA = "seg-leitura-BBBB2222"
SEGREDO_PROPOSTAS = "seg-propostas-CCCC3333"


def make_cfg(**kw) -> config.Config:
    base = dict(
        api_url="https://crm.invalid", secret_despacho=SEGREDO_DESPACHO, secret_leitura=SEGREDO_LEITURA,
        secret_propostas=SEGREDO_PROPOSTAS, executor_id="exec-teste",
        smtp_host="smtp.invalid", smtp_user="u", smtp_password="senha-smtp-ZZZZ", from_address="vendas@salvita.invalid",
        reply_to="vendas@salvita.invalid", imap_host="imap.invalid", imap_user="u", imap_password="senha-imap-YYYY",
        pacing_seconds=180, max_per_cycle=5, dry_run=False, journal_path=":memory:",
    )
    base.update(kw)
    return config.Config(**base)


def autorizacao(assunto="Caixa de sal", corpo="Olá, tudo bem?\nSal Vita.", **kw) -> dict:
    d = {
        "despachoToken": "tok-despacho-0123456789", "expiraEm": "2099-01-01T00:00:00Z",
        "para": "compras@empresa.invalid", "assunto": assunto, "corpo": corpo,
        "messageIdHeader": "<abc123@salvita.invalid>",
        "contentHash": despacho.hash_conteudo(assunto, corpo),
        "cabecalhos": {"List-Unsubscribe": "<https://crm.invalid/sair/xyz>"},
    }
    d.update(kw)
    return d


class FakeApi:
    """Registra as chamadas e devolve respostas programadas."""

    def __init__(self) -> None:
        self.chamadas: list[tuple] = []
        self.modo_resp = api_mod.Resposta(200, {"modo": "REVIEW", "canal": {"ativo": True, "politicaAprovada": True},
                                                "agenteAtivo": False, "limites": {}})
        self.reservar_resp = api_mod.Resposta(200, {"mensagens": []})
        self.autorizar_resp: list[api_mod.Resposta] = []
        self.resultado_resp: api_mod.Resposta | None = api_mod.Resposta(200, {})
        self.evento_resp = api_mod.Resposta(200, {"ok": True})
        self.eventos: list[dict] = []

    def modo(self):
        self.chamadas.append(("modo",))
        return self.modo_resp

    def heartbeat(self, ciclo, contagens):
        self.chamadas.append(("heartbeat", ciclo, dict(contagens)))
        return api_mod.Resposta(200, {})

    def reservar(self, maximo):
        self.chamadas.append(("reservar", maximo))
        return self.reservar_resp

    def autorizar(self, message_id, reserva_token, fence):
        self.chamadas.append(("autorizar", message_id))
        return self.autorizar_resp.pop(0)

    def resultado(self, message_id, token, resultado, resposta):
        self.chamadas.append(("resultado", message_id, resultado))
        return self.resultado_resp

    def resultado_com_retentativa(self, message_id, token, resultado, resposta, tentativas=5):
        self.chamadas.append(("resultado", message_id, resultado))
        return self.resultado_resp

    def evento_caixa(self, ev):
        self.chamadas.append(("evento", ev["tipo"]))
        self.eventos.append(ev)
        return self.evento_resp

    def nomes(self) -> list[str]:
        return [c[0] for c in self.chamadas]


class FakeSmtp:
    """smtplib.SMTP de mentira. `plano` diz onde falhar; ver os testes."""

    plano: dict = {}
    instancias: list = []

    def __init__(self, *a, **k) -> None:
        FakeSmtp.instancias.append(self)
        self.etapas: list[str] = []
        self._falha("conectar")

    def _falha(self, etapa: str) -> None:
        self.etapas.append(etapa)
        x = self.plano.get(etapa)
        if x is not None:
            raise x

    def ehlo(self):
        self._falha("ehlo")
        return (250, b"ok")

    def starttls(self, context=None):
        self._falha("starttls")
        return (220, b"ready")

    def login(self, u, p):
        self._falha("auth")

    def mail(self, remetente):
        self.etapas.append("mail")
        return self.plano.get("mail_resp", (250, b"ok"))

    def rcpt(self, dest):
        self.etapas.append("rcpt")
        return self.plano.get("rcpt_resp", (250, b"ok"))

    def data(self, corpo):
        self._falha("data")
        return self.plano.get("data_resp", (250, b"2.0.0 queued as ABC"))

    def quit(self):
        self._falha("quit")

    def close(self):
        pass

    @classmethod
    def reset(cls, **plano) -> None:
        cls.plano = plano
        cls.instancias = []
