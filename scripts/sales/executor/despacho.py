"""
Despacho: reservar -> autorizar -> diário -> SMTP -> resultado.

═══ A FRONTEIRA DO SMTP (o que impede e-mail duplicado) ═══

O executor conduz o SMTP passo a passo (EHLO, STARTTLS, AUTH, MAIL, RCPT, DATA) e
marca `data_emitido = True` ANTES de entregar o comando DATA ao smtplib. Depois disso,
o servidor pode ter aceitado a mensagem sem que a gente tenha visto a resposta.

  Situação                                                         Resultado
  ───────────────────────────────────────────────────────────────  ──────────────────
  Resposta 2xx ao fim do DATA                                      ACCEPTED
  Resposta 4xx (RCPT ou DATA/fim do DATA)                          RETRYABLE_FAILURE
  Resposta 5xx (RCPT ou DATA/fim do DATA)                          PERMANENT_FAILURE
  QUALQUER exceção depois de emitir DATA sem resposta SMTP
  (conexão caiu, timeout, TLS, resposta inesperada)                UNKNOWN
  Qualquer falha ANTES do DATA (conexão, TLS, AUTH, MAIL, 4xx)     RETRYABLE_FAILURE

Decisões deliberadas:
  * 5xx em EHLO/STARTTLS/AUTH/MAIL FROM é problema nosso (conta, remetente, provedor),
    não do destinatário: RETRYABLE, não PERMANENT. Só 5xx de RCPT/DATA diz algo sobre
    ESTA mensagem/destinatário.
  * Falha de autenticação (SMTPAuthenticationError) é RETRYABLE e PARA o executor.
  * Erro ao fechar a conexão (QUIT) depois de um 2xx não muda o resultado: ACCEPTED.
  * UNKNOWN nunca é reenviado pelo executor: o servidor o leva para conciliação humana.
"""

from __future__ import annotations

import hashlib
import logging
import re
import smtplib
import ssl
import threading
import time
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, formatdate
from typing import Any, Callable

import api as api_mod
import config
import journal as journal_mod

logger = logging.getLogger("sales.despacho")

ACCEPTED = "ACCEPTED"
RETRYABLE = "RETRYABLE_FAILURE"
PERMANENT = "PERMANENT_FAILURE"
UNKNOWN = "UNKNOWN"

# Cabeçalhos que o servidor NÃO pode sobrescrever.
_CABECALHOS_PROIBIDOS = {
    "from", "to", "cc", "bcc", "subject", "message-id", "date", "reply-to", "sender",
    "content-type", "content-transfer-encoding", "mime-version", "return-path",
}
_EMAIL_RE = re.compile(r"^[^\s<>@,;\"']+@[^\s<>@,;\"']+\.[^\s<>@,;\"']+$")


class MensagemInvalida(Exception):
    """A autorização veio incompleta ou adulterada: não enviar."""


@dataclass
class ResultadoSmtp:
    outcome: str
    resposta: str
    etapa: str
    falha_autenticacao: bool = False
    data_emitido: bool = False


class _RespostaSmtp(Exception):
    """Resposta SMTP de erro devolvida (sem exceção do smtplib) em MAIL/RCPT."""

    def __init__(self, codigo: int, texto: str) -> None:
        super().__init__(texto)
        self.codigo = codigo
        self.texto = texto


def _texto(resp: Any) -> str:
    if isinstance(resp, bytes):
        resp = resp.decode("utf-8", "replace")
    return re.sub(r"\s+", " ", str(resp)).strip()


def _por_codigo(codigo: int) -> str | None:
    if 200 <= codigo < 300:
        return ACCEPTED
    if 400 <= codigo < 500:
        return RETRYABLE
    if 500 <= codigo < 600:
        return PERMANENT
    return None


# ── montagem da mensagem ───────────────────────────────────────────────────────────────────────

def hash_conteudo(assunto: str, corpo: str) -> str:
    """Mesma fórmula do servidor (hashConteudo em server/lib/sales/mensagem.ts)."""
    return hashlib.sha256(f"{assunto}\n\n{corpo}".encode("utf-8")).hexdigest()


def montar_mensagem(cfg: config.Config, aut: dict[str, Any]) -> tuple[EmailMessage, str]:
    """Constrói o e-mail a partir da resposta de `autorizar`. Devolve (mensagem, destinatário)."""
    para = str(aut.get("para", "")).strip()
    assunto = str(aut.get("assunto", ""))
    corpo = str(aut.get("corpo", ""))
    header_id = str(aut.get("messageIdHeader", "")).strip()
    cabecalhos = aut.get("cabecalhos") or {}
    if not _EMAIL_RE.match(para):
        raise MensagemInvalida("destinatário inválido")
    if not assunto.strip() or not corpo.strip():
        raise MensagemInvalida("assunto ou corpo vazio")
    if "\r" in assunto or "\n" in assunto:
        raise MensagemInvalida("assunto com quebra de linha")
    if not header_id:
        raise MensagemInvalida("messageIdHeader ausente")
    if aut.get("contentHash") != hash_conteudo(assunto, corpo):
        raise MensagemInvalida("contentHash não confere com assunto+corpo")
    if not isinstance(cabecalhos, dict):
        raise MensagemInvalida("cabecalhos em formato inesperado")
    if not any(str(k).lower() == "list-unsubscribe" for k in cabecalhos):
        raise MensagemInvalida("List-Unsubscribe ausente: não se envia sem opção de sair")
    if not cfg.from_address:
        raise MensagemInvalida("SALES_FROM_ADDRESS não configurado")

    msg = EmailMessage()
    msg["From"] = formataddr((cfg.from_name, cfg.from_address))
    msg["To"] = para
    msg["Subject"] = assunto
    msg["Date"] = formatdate(localtime=False)
    msg["Message-ID"] = header_id if header_id.startswith("<") else f"<{header_id}>"
    msg["Reply-To"] = cfg.reply_to or cfg.from_address
    for nome, valor in cabecalhos.items():
        nome, valor = str(nome).strip(), str(valor)
        if not nome or nome.lower() in _CABECALHOS_PROIBIDOS:
            continue
        if re.search(r"[\r\n]", nome + valor) or not re.match(r"^[A-Za-z0-9-]+$", nome):
            raise MensagemInvalida(f"cabeçalho inválido: {nome[:30]}")
        msg[nome] = valor
    msg.set_content(corpo, subtype="plain", charset="utf-8", cte="quoted-printable")
    return msg, para


# ── SMTP ───────────────────────────────────────────────────────────────────────────────────────

def enviar_smtp(cfg: config.Config, msg: EmailMessage, destinatario: str) -> ResultadoSmtp:
    """
    Envia UMA mensagem e classifica o resultado conforme a tabela no topo deste arquivo.
    Nunca levanta exceção: toda falha vira ResultadoSmtp.
    """
    etapa = "conectar"
    data_emitido = False
    smtp: smtplib.SMTP | None = None
    try:
        ctx = ssl.create_default_context()
        if cfg.smtp_security == "ssl":
            smtp = smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, timeout=cfg.smtp_timeout, context=ctx)
        else:
            smtp = smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=cfg.smtp_timeout)
        etapa = "ehlo"
        smtp.ehlo()
        if cfg.smtp_security == "starttls":
            etapa = "starttls"
            smtp.starttls(context=ctx)
            smtp.ehlo()
        etapa = "auth"
        smtp.login(cfg.smtp_user, cfg.smtp_password)
        etapa = "mail"
        codigo, resp = smtp.mail(cfg.from_address)
        if codigo != 250:
            raise _RespostaSmtp(codigo, _texto(resp))
        etapa = "rcpt"
        codigo, resp = smtp.rcpt(destinatario)
        if codigo not in (250, 251):
            raise _RespostaSmtp(codigo, _texto(resp))
        etapa = "data"
        # ── FRONTEIRA: a partir daqui o servidor pode aceitar sem a gente ver a resposta. ──
        data_emitido = True
        codigo, resp = smtp.data(msg.as_bytes())
        resposta = f"{codigo} {_texto(resp)}"[:300]
        if 200 <= codigo < 300:
            return ResultadoSmtp(ACCEPTED, resposta, etapa, data_emitido=True)
        # smtplib só devolve sem exceção em 250; qualquer outra coisa é inesperada.
        return ResultadoSmtp(UNKNOWN, resposta, etapa, data_emitido=True)
    except smtplib.SMTPAuthenticationError as e:
        return ResultadoSmtp(RETRYABLE, f"{e.smtp_code} {_texto(e.smtp_error)}"[:300], etapa,
                             falha_autenticacao=True, data_emitido=data_emitido)
    except smtplib.SMTPNotSupportedError as e:  # servidor sem AUTH: configuração errada
        return ResultadoSmtp(RETRYABLE, f"não suportado: {_texto(e)}"[:300], etapa,
                             falha_autenticacao=(etapa == "auth"), data_emitido=data_emitido)
    except _RespostaSmtp as e:
        return _classificar_resposta(e.codigo, e.texto, etapa, data_emitido)
    except smtplib.SMTPResponseException as e:
        return _classificar_resposta(e.smtp_code, _texto(e.smtp_error), etapa, data_emitido)
    except Exception as e:  # noqa: BLE001 — conexão, TLS, timeout, desconexão...
        resposta = f"{type(e).__name__}: {_texto(e)}"[:300]
        return ResultadoSmtp(UNKNOWN if data_emitido else RETRYABLE, resposta, etapa, data_emitido=data_emitido)
    finally:
        if smtp is not None:
            try:
                smtp.quit()
            except Exception:  # noqa: BLE001 — o resultado já está decidido
                try:
                    smtp.close()
                except Exception:  # noqa: BLE001
                    pass


def _classificar_resposta(codigo: int, texto: str, etapa: str, data_emitido: bool) -> ResultadoSmtp:
    resposta = f"{codigo} {texto}"[:300]
    por_codigo = _por_codigo(codigo)
    if data_emitido:
        # Houve resposta SMTP explícita ao DATA: não é desconhecido.
        return ResultadoSmtp(por_codigo or UNKNOWN, resposta, etapa, data_emitido=True)
    if etapa == "rcpt" and por_codigo in (RETRYABLE, PERMANENT):
        return ResultadoSmtp(por_codigo, resposta, etapa)
    # Antes do DATA, fora do RCPT: problema de conexão/conta/remetente, nunca "permanente".
    return ResultadoSmtp(RETRYABLE, resposta, etapa)


# ── orquestração ───────────────────────────────────────────────────────────────────────────────

class Despachante:
    def __init__(self, cfg: config.Config, api: api_mod.Api, journal: journal_mod.Journal,
                 smtp_enviar: Callable[..., ResultadoSmtp] = enviar_smtp,
                 stop: threading.Event | None = None,
                 sleep: Callable[[float], None] | None = None,
                 agora: Callable[[], float] = time.time) -> None:
        self.cfg = cfg
        self.api = api
        self.journal = journal
        self.smtp_enviar = smtp_enviar
        self.stop = stop or threading.Event()
        self._sleep = sleep or (lambda s: self.stop.wait(s))
        self._agora = agora
        self.contagens: dict[str, int] = {}

    # contadores do ciclo (vão para o heartbeat)
    def _c(self, nome: str, n: int = 1) -> None:
        self.contagens[nome] = self.contagens.get(nome, 0) + n

    @property
    def parada(self) -> str | None:
        return self.journal.meta_get("parada")

    def parar(self, motivo: str) -> None:
        """Para o despacho de forma persistente (sobrevive a reinício). Só um humano libera."""
        logger.error("ALERTA: despacho PARADO — %s. Libere manualmente com: python3 worker.py --liberar", motivo)
        self.journal.meta_set("parada", motivo[:200])

    # ── partida / pendências ────────────────────────────────────────────────

    def recuperar(self) -> None:
        """Na partida: DISPATCHING vira UNKNOWN. Nada é reenviado."""
        self.journal.recuperar_na_partida()

    def informar_pendentes(self) -> None:
        """Reenvia ao servidor resultados já decididos mas ainda não confirmados."""
        for r in self.journal.resultados_pendentes():
            if self.stop.is_set():
                return
            self._informar(r["id"], r["message_id"], r["despacho_token"], r["outcome"], r["smtp_response"])

    def _informar(self, attempt_id: int, message_id: str, token: str, outcome: str, resposta: str | None) -> None:
        try:
            r = self.api.resultado_com_retentativa(message_id, token, outcome, resposta)
        except api_mod.ApiAuthError:
            raise
        if r is None:
            logger.warning("resultado da mensagem %s segue pendente no diário (servidor inacessível)", message_id)
            self._c("resultados_pendentes")
            return
        if r.ok:
            self.journal.marcar_informado(attempt_id, "repetido" if r.dados.get("repetido") else None)
        elif r.status == 409:
            self.journal.marcar_informado(attempt_id, "servidor respondeu 409 (conflito)")
            self._c("conflitos")
            logger.error("ALERTA: 409 ao informar resultado %s da mensagem %s — conciliar no painel", outcome, message_id)
        else:
            self.journal.marcar_rejeitado(attempt_id, f"servidor respondeu {r.status}: {r.dados.get('codigo', '')}")
            self._c("resultados_rejeitados")
            logger.error("ALERTA: servidor recusou o resultado %s da mensagem %s (HTTP %s %s) — conciliar no painel",
                         outcome, message_id, r.status, r.dados.get("codigo", ""))

    # ── ciclo ───────────────────────────────────────────────────────────────

    def ciclo(self) -> None:
        """Um ciclo de despacho. Pré-condição: o /modo já permitiu despachar."""
        if self.cfg.dry_run:  # defesa em profundidade: o worker já não chama isto em DRY_RUN
            logger.info("DRY_RUN: ciclo de despacho ignorado")
            return
        if self.parada:
            logger.warning("despacho parado: %s", self.parada)
            return
        r = self.api.reservar(self.cfg.max_per_cycle)
        if not r.ok:
            logger.warning("reservar: HTTP %s %s", r.status, r.dados.get("codigo", ""))
            return
        mensagens = r.dados.get("mensagens") or []
        if not mensagens:
            logger.info("fila vazia%s", f" ({r.dados['motivo']})" if r.dados.get("motivo") else "")
            return
        self._c("reservadas", len(mensagens))
        for item in mensagens:
            if self.stop.is_set() or self.parada:
                break
            continuar = self._despachar_uma(item)
            if not continuar:
                break

    def _aguardar_ritmo(self) -> None:
        ultimo = float(self.journal.meta_get("ultimo_envio_ts", "0") or 0)
        faltam = ultimo + self.cfg.pacing_seconds - self._agora()
        if faltam > 0:
            logger.info("ritmo: aguardando %.0fs antes do próximo envio", faltam)
            self._sleep(faltam)

    def _despachar_uma(self, item: dict[str, Any]) -> bool:
        """Devolve False para encerrar o ciclo (falha global ou parada)."""
        message_id = str(item.get("messageId", ""))
        if self.journal.ja_enviada(message_id=message_id):
            logger.warning("mensagem %s já tem tentativa local que pode ter saído: NÃO reenvia", message_id)
            self._c("puladas")
            return True
        self._aguardar_ritmo()
        if self.stop.is_set():
            return False

        # Autorização IMEDIATAMENTE antes de enviar.
        a = self.api.autorizar(message_id, str(item.get("reservaToken", "")), int(item.get("fence", 0)))
        if not a.ok:
            codigo = a.dados.get("codigo", "")
            logger.info("autorização recusada para %s: HTTP %s %s", message_id, a.status, codigo)
            self._c("recusadas")
            # 423/503 são condições globais (pausa, canal, supressão indisponível): encerra o ciclo.
            return a.status not in (423, 503)

        token = str(a.dados.get("despachoToken", ""))
        try:
            msg, para = montar_mensagem(self.cfg, a.dados)
        except MensagemInvalida as e:
            logger.error("mensagem %s NÃO enviada: %s", message_id, e)
            self._c("recusadas")
            if token:  # nada saiu: libera a mensagem no servidor
                try:
                    self.api.resultado(message_id, token, RETRYABLE, f"executor: {e}"[:300])
                except (api_mod.ApiNetworkError,):
                    pass
            return True
        header = msg["Message-ID"]
        if self.journal.ja_enviada(header=header):
            logger.warning("Message-ID %s já enviado antes: NÃO reenvia", header)
            self._c("puladas")
            return True

        # 1) Diário ANTES do SMTP.
        attempt_id = self.journal.registrar_despacho(
            message_id, int(item.get("fence", 0)), header, str(a.dados.get("contentHash", "")), para, token)
        self.journal.meta_set("ultimo_envio_ts", self._agora())

        # 2) SMTP — nunca em DRY_RUN (o worker nem chega aqui; esta guarda é redundante de propósito).
        if self.cfg.dry_run:  # pragma: no cover
            raise RuntimeError("DRY_RUN: tentativa de envio real bloqueada")
        res = self.smtp_enviar(self.cfg, msg, para)
        logger.info("mensagem %s: %s (etapa %s, destino @%s)", message_id, res.outcome, res.etapa, para.rsplit("@", 1)[-1])

        # 3) Resultado no diário ANTES de falar com a API.
        self.journal.gravar_resultado(attempt_id, res.outcome, res.resposta)
        self._contabilizar(res)
        self._informar(attempt_id, message_id, token, res.outcome, res.resposta)

        if res.falha_autenticacao:
            self.parar("falha de autenticação SMTP")
            return False
        if self.journal.meta_int("falhas_permanentes_seguidas") >= self.cfg.permanent_streak_limit:
            self.parar(f"{self.cfg.permanent_streak_limit} falhas permanentes seguidas")
            return False
        # Qualquer coisa além de aceita/permanente (conexão ruim, UNKNOWN) encerra o ciclo.
        return res.outcome in (ACCEPTED, PERMANENT)

    def _contabilizar(self, res: ResultadoSmtp) -> None:
        if res.outcome == ACCEPTED:
            self._c("aceitas")
            self.journal.meta_set("falhas_permanentes_seguidas", 0)
        elif res.outcome == PERMANENT:
            self._c("falhas_permanentes")
            self.journal.meta_set("falhas_permanentes_seguidas", self.journal.meta_int("falhas_permanentes_seguidas") + 1)
        elif res.outcome == UNKNOWN:
            self._c("desconhecidas")
            logger.error("ALERTA: envio UNKNOWN — NÃO será reenviado; conciliar no painel")
        else:
            self._c("falhas_temporarias")
