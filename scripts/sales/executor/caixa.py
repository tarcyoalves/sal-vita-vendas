"""
Caixa de entrada: leitura IMAP SOMENTE LEITURA + classificação para o servidor.

Garantias:
  * `select(readonly=True)` e `BODY.PEEK[]`: nada é marcado como lido, nada é apagado.
  * Nunca responde e-mail nenhum.
  * Não chama nenhum modelo de IA. A classificação da resposta (REPLY_CLASSES) fica em
    branco; o Hermes pode plugar uma função em `caixa.classificar` (recebe só o trecho
    JÁ limpo de telefone/CPF/CNPJ/e-mails, nunca o e-mail cru).
  * O trecho enviado ao servidor tem no máximo 600 caracteres, sem telefone, CPF, CNPJ
    nem endereços de e-mail.
  * idempotencyKey = Message-ID do e-mail recebido (repetir é seguro).

Prioridade da classificação de cada e-mail recebido:
  1. devolução (DSN)            -> DEVOLVIDO   (e relatório de abuso ARF -> RECLAMACAO)
  2. resposta automática        -> AUTO_RESPOSTA   (só se responde a mensagem nossa)
  3. pedido para sair           -> PEDIU_PARA_SAIR (mesmo sem vínculo com mensagem nossa)
  4. responde mensagem nossa    -> RESPOSTA
  5. qualquer outra coisa       -> ignorado (fica na caixa para um humano)
"""

from __future__ import annotations

import datetime as dt
import hashlib
import imaplib
import logging
import re
import ssl
import unicodedata
from email import message_from_bytes, policy
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any, Callable, Optional

import api as api_mod
import config
import journal as journal_mod

logger = logging.getLogger("sales.caixa")

# Espelho de REPLY_CLASSES (shared/sales.ts). Só para validar o que o gancho devolver.
REPLY_CLASSES = ("interessado", "pediu_preco", "pediu_informacao", "compra_depois",
                 "sem_interesse", "ja_tem_fornecedor", "outro")

# Gancho opcional do Hermes: classificar(trecho_limpo) -> uma de REPLY_CLASSES, ou None.
# Padrão None: este módulo NÃO classifica sozinho e NÃO chama IA.
classificar: Optional[Callable[[str], Optional[str]]] = None

TRECHO_MAX = 600


class ImapAuthError(Exception):
    """Login IMAP recusado."""


# ── limpeza de dados pessoais ──────────────────────────────────────────────────────────────────

_CNPJ = re.compile(r"(?<!\d)\d{2}\.?\d{3}\.?\d{3}\s?/\s?\d{4}\s?-?\s?\d{2}(?!\d)")
_CPF = re.compile(r"(?<!\d)\d{3}\.?\d{3}\.?\d{3}\s?-\s?\d{2}(?!\d)")
_EMAIL = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
# 8+ dígitos, tolerando separadores comuns (espaço, parênteses, ponto, hífen) entre eles.
_FONE = re.compile(r"\(?\+?\d(?:[\s().\-]{0,2}\d){7,}(?!\d)")


def limpar_pii(texto: str) -> str:
    """Remove CNPJ, CPF, e-mails (todos, inclusive de terceiros) e telefones."""
    t = _CNPJ.sub("[documento removido]", texto)
    t = _CPF.sub("[documento removido]", t)
    t = _EMAIL.sub("[e-mail removido]", t)
    t = _FONE.sub("[telefone removido]", t)
    return t


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


# ── extração de texto ──────────────────────────────────────────────────────────────────────────

_CORTE = re.compile(
    r"^\s*(?:em\s.{5,150}escreveu:?|on\s.{5,150}wrote:?|-{2,}\s*(?:original message|mensagem original|forwarded)"
    r".*|_{5,}\s*|de:\s.+|from:\s.+|enviado do meu .+|sent from my .+)\s*$",
    re.IGNORECASE,
)


def _decodificar(parte: Message) -> str:
    try:
        return parte.get_content()
    except Exception:  # noqa: BLE001 — charset desconhecido etc.
        payload = parte.get_payload(decode=True) or b""
        return payload.decode("utf-8", "replace")


def texto_da_mensagem(msg: Message) -> str:
    corpo = msg.get_body(preferencelist=("plain", "html")) if hasattr(msg, "get_body") else None
    if corpo is None:
        return ""
    texto = _decodificar(corpo)
    if corpo.get_content_type() == "text/html":
        texto = re.sub(r"(?is)<(script|style).*?</\1>", " ", texto)
        texto = re.sub(r"(?s)<[^>]+>", " ", texto)
    return texto


def texto_novo(texto: str) -> str:
    """Só o que a pessoa escreveu: sem linhas citadas (>) e sem a cadeia anterior."""
    saida: list[str] = []
    for linha in texto.splitlines():
        if _CORTE.match(linha):
            break
        if linha.lstrip().startswith(">"):
            continue
        saida.append(linha)
    return re.sub(r"\s+", " ", " ".join(saida)).strip()


def trecho_seguro(texto: str) -> str:
    return limpar_pii(texto_novo(texto))[:TRECHO_MAX].strip()


# ── detectores ─────────────────────────────────────────────────────────────────────────────────

_ASSUNTO_AUTO = re.compile(
    r"resposta automatica|automatic reply|auto.?reply|autoreply|auto.?resposta|out of office|"
    r"fora do escritorio|fora do office|estou ausente|ausencia temporaria|estou de ferias|em ferias|"
    r"mensagem automatica|vacation|away from (the )?office|nao estarei",
)

_SAIR_FORTE = re.compile(
    r"descadastr|unsubscribe|opt.?out|nao quero (mais )?receber|nao desejo (mais )?receber|"
    r"parar de receber|(pare|parem|para) de (me |nos )?(enviar|mandar)|stop (sending|emailing)|"
    r"remov\w+ (meu|minha|o meu|a minha|me|nosso|nossa|da lista|esse|este)|me (remova|remover|tire|exclua|retire)|"
    r"tirar (meu|o meu)|(quero|queremos|gostaria de|gostariamos de|desejo|preciso) sair|cancel\w+ (o |a )?(recebimento|inscricao|envio)|"
    r"nao tenho interesse em receber|remove me|take me off",
)
_SAIR_FRACO = re.compile(r"\b(sair|remover|remova|remove|stop|pare|cancelar|descadastre)\b")
_SAIR_ASSUNTO = {"sair", "remover", "remova", "remove", "stop", "pare", "cancelar", "unsubscribe", "descadastrar", "descadastre"}


def pediu_para_sair(assunto: str, texto: str) -> bool:
    a = _sem_acento(assunto).strip(" .!:-")
    novo = _sem_acento(texto_novo(texto))
    a_limpo = re.sub(r"^(re|res|enc|fwd?)\s*:\s*", "", a).strip()
    if _SAIR_FORTE.search(a) or _SAIR_FORTE.search(novo):
        return True
    if a_limpo in _SAIR_ASSUNTO:
        return True
    return len(novo) <= 40 and bool(_SAIR_FRACO.search(novo))


def _em_massa(msg: Message) -> bool:
    """Boletim/lista (tem List-Unsubscribe, List-Id ou Precedence bulk): não é pedido de uma pessoa."""
    if msg.get("List-Unsubscribe") is not None or msg.get("List-Id") is not None:
        return True
    return str(msg.get("Precedence", "")).strip().lower() in ("bulk", "list", "junk")


def eh_resposta_automatica(msg: Message) -> bool:
    auto = str(msg.get("Auto-Submitted", "")).strip().lower()
    if auto and auto != "no":
        return True
    if msg.get("X-Autoreply") is not None or msg.get("X-Autorespond") is not None:
        return True
    if str(msg.get("Precedence", "")).strip().lower() in ("auto_reply", "auto-reply", "autoreply"):
        return True
    return bool(_ASSUNTO_AUTO.search(_sem_acento(str(msg.get("Subject", "")))))


def _ids(valor: Any) -> list[str]:
    return re.findall(r"<[^<>\s]+>", str(valor or ""))


def ids_referenciados(msg: Message) -> list[str]:
    return _ids(msg.get("In-Reply-To")) + _ids(msg.get("References"))


def _tipo_relatorio(msg: Message) -> str:
    if msg.get_content_type() == "multipart/report":
        return (msg.get_param("report-type") or "").lower()
    return ""


def _e_remetente_automatico(msg: Message) -> bool:
    local = parseaddr(str(msg.get("From", "")))[1].split("@")[0].lower()
    return local in ("mailer-daemon", "postmaster", "mail-daemon")


def _grupos(parte: Message) -> list[Message]:
    p = parte.get_payload()
    return [g for g in p if isinstance(g, Message)] if isinstance(p, list) else []


def _extrair_dsn(msg: Message, conhece: Callable[[str], Any]) -> dict[str, Any]:
    info: dict[str, Any] = {"email": None, "acao": None, "status": None, "diagnostico": "", "original": None}
    for parte in msg.walk():
        tipo = parte.get_content_type()
        if tipo == "message/delivery-status":
            for g in _grupos(parte):
                final = str(g.get("Final-Recipient") or g.get("Original-Recipient") or "")
                if final and not info["email"]:
                    info["email"] = parseaddr(final.split(";", 1)[-1].strip())[1].lower() or None
                if g.get("Action") and not info["acao"]:
                    info["acao"] = str(g["Action"]).strip().lower()
                if g.get("Status") and not info["status"]:
                    info["status"] = str(g["Status"]).strip()
                if g.get("Diagnostic-Code") and not info["diagnostico"]:
                    info["diagnostico"] = str(g["Diagnostic-Code"])
        elif tipo == "message/rfc822":
            for g in _grupos(parte):
                if g.get("Message-ID") and not info["original"]:
                    info["original"] = str(g["Message-ID"]).strip()
        elif tipo in ("text/rfc822-headers", "text/rfc822") and not info["original"]:
            ach = re.search(r"(?im)^message-id:\s*(<[^<>\s]+>)", _decodificar(parte))
            if ach:
                info["original"] = ach.group(1)
    if not info["email"] or not info["original"]:  # DSN fora do padrão: procura no texto
        texto = texto_da_mensagem(msg)
        if not info["original"]:
            for mid in _ids(texto):
                if conhece(mid):
                    info["original"] = mid
                    break
    if not info["email"] and info["original"]:
        linha = conhece(info["original"])
        if linha:
            info["email"] = str(linha["para"]).lower() or None
    return info


def _extrair_arf(msg: Message) -> str | None:
    for parte in msg.walk():
        if parte.get_content_type() == "message/feedback-report":
            for g in _grupos(parte):
                for campo in ("Original-Rcpt-To", "Removal-Recipient"):
                    if g.get(campo):
                        return parseaddr(str(g[campo]))[1].lower() or None
        elif parte.get_content_type() == "message/rfc822":
            for g in _grupos(parte):
                if g.get("To"):
                    return parseaddr(str(g["To"]))[1].lower() or None
    return None


def _chave(msg: Message, bruto: bytes) -> str:
    mid = str(msg.get("Message-ID", "")).strip()
    if len(mid) >= 8:
        return mid[:300]
    return "semid:" + hashlib.sha256(bruto).hexdigest()[:40]


def _recebido_em(msg: Message) -> str | None:
    try:
        d = parsedate_to_datetime(str(msg.get("Date", "")))
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return None


def detectar(msg: Message, bruto: bytes, conhece: Callable[[str], Any],
             proprio: str = "") -> list[dict[str, Any]]:
    """
    Transforma um e-mail recebido em 0..2 eventos para POST /api/sales/caixa/eventos.
    `conhece(message_id)` devolve a linha do diário (com a coluna `para`) ou None.
    """
    remetente = parseaddr(str(msg.get("From", "")))[1].lower()
    if proprio and remetente == proprio.lower():
        return []
    chave = _chave(msg, bruto)
    recebido = _recebido_em(msg)
    vinculo = next((conhece(i) and i for i in ids_referenciados(msg) if conhece(i)), None)
    linha = conhece(vinculo) if vinculo else None
    texto = texto_da_mensagem(msg)
    assunto = str(msg.get("Subject", ""))

    def evento(tipo: str, email: str, **extra: Any) -> dict[str, Any]:
        e: dict[str, Any] = {"idempotencyKey": chave, "tipo": tipo, "email": email}
        if recebido:
            e["recebidoEm"] = recebido
        e.update({k: v for k, v in extra.items() if v})
        return e

    # 1) Devolução / relatório de abuso
    tipo_rel = _tipo_relatorio(msg)
    if tipo_rel == "feedback-report":
        email = _extrair_arf(msg)
        return [evento("RECLAMACAO", email, emRespostaA=vinculo)] if email else []
    if tipo_rel == "delivery-status" or _e_remetente_automatico(msg):
        info = _extrair_dsn(msg, conhece)
        if info["acao"] and info["acao"] != "failed":
            logger.info("DSN com Action=%s ignorada (não é falha definitiva)", info["acao"])
            return []
        if not info["email"]:
            logger.warning("devolução sem destinatário identificável (%s): ignorada", chave[:40])
            return []
        trecho = limpar_pii(" ".join(x for x in (f"status {info['status']}" if info["status"] else "", info["diagnostico"]) if x))[:300]
        return [evento("DEVOLVIDO", info["email"], emRespostaA=info["original"] or vinculo, trecho=trecho)]

    # 2) Resposta automática (só se for resposta a algo nosso)
    if eh_resposta_automatica(msg):
        if not linha:
            return []
        return [evento("AUTO_RESPOSTA", str(linha["para"]).lower() or remetente, emRespostaA=vinculo)]

    if not remetente or "@" not in remetente:
        return []

    # 3) Pedido para sair (com ou sem vínculo)
    # Sem vínculo com mensagem nossa só vale pedido curto de uma pessoa (não rodapé de boletim).
    if pediu_para_sair(assunto, texto) and (linha or (not _em_massa(msg) and len(texto_novo(texto)) <= 300)):
        eventos = [evento("PEDIU_PARA_SAIR", remetente, emRespostaA=vinculo, trecho=trecho_seguro(texto))]
        if linha and str(linha["para"]).lower() not in ("", remetente):  # respondeu de outro endereço: suprime os dois
            e2 = evento("PEDIU_PARA_SAIR", str(linha["para"]).lower(), emRespostaA=vinculo, trecho=trecho_seguro(texto))
            e2["idempotencyKey"] = (chave + "#destino")[:300]
            eventos.append(e2)
        return eventos

    # 4) Resposta humana a mensagem nossa
    if linha:
        trecho = trecho_seguro(texto)
        extra: dict[str, Any] = {}
        if classificar is not None and trecho:
            try:
                c = classificar(trecho)
                if c in REPLY_CLASSES:
                    extra["classificacao"] = c
            except Exception:  # noqa: BLE001 — o gancho do Hermes nunca derruba o executor
                logger.exception("gancho classificar falhou: seguindo sem classificação")
        return [evento("RESPOSTA", str(linha["para"]).lower() or remetente, emRespostaA=vinculo, trecho=trecho, **extra)]

    return []  # não relacionado: fica na caixa para humano


# ── varredura IMAP ─────────────────────────────────────────────────────────────────────────────

_MESES = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _data_imap(d: dt.date) -> str:
    return f"{d.day:02d}-{_MESES[d.month - 1]}-{d.year}"


class Caixa:
    def __init__(self, cfg: config.Config, api: api_mod.Api, journal: journal_mod.Journal,
                 imap_factory: Callable[..., Any] = imaplib.IMAP4_SSL,
                 hoje: Callable[[], dt.date] = dt.date.today) -> None:
        self.cfg = cfg
        self.api = api
        self.journal = journal
        self._factory = imap_factory
        self._hoje = hoje

    def _conhece(self, mid: str) -> Any:
        return self.journal.conhece_header(mid)

    def varrer(self) -> dict[str, int]:
        """
        Varre a caixa uma vez. Devolve contagens por tipo de evento (e 'ignoradas', 'erros').
        Levanta ImapAuthError (login recusado) e ApiAuthError (401); os demais problemas viram log.
        """
        cont: dict[str, int] = {}
        conn = None
        try:
            conn = self._factory(self.cfg.imap_host, self.cfg.imap_port,
                                 ssl_context=ssl.create_default_context(), timeout=self.cfg.api_timeout)
            try:
                conn.login(self.cfg.imap_user, self.cfg.imap_password)
            except imaplib.IMAP4.error:
                raise ImapAuthError("login IMAP recusado") from None
            typ, _ = conn.select("INBOX", readonly=True)
            if typ != "OK":
                raise OSError("não foi possível abrir a INBOX")
            self._processar(conn, cont)
            self.journal.meta_set("imap_falhas_seguidas", 0)
        except (ImapAuthError, api_mod.ApiAuthError):
            raise
        except (imaplib.IMAP4.error, OSError, TimeoutError, api_mod.ApiNetworkError) as e:
            n = self.journal.meta_int("imap_falhas_seguidas") + 1
            self.journal.meta_set("imap_falhas_seguidas", n)
            cont["erros"] = cont.get("erros", 0) + 1
            logger.warning("varredura da caixa falhou (%s); falhas seguidas: %d", type(e).__name__, n)
        finally:
            if conn is not None:
                try:
                    conn.logout()
                except Exception:  # noqa: BLE001
                    pass
        return cont

    def _processar(self, conn: Any, cont: dict[str, int]) -> None:
        validade = ""
        try:
            _, v = conn.response("UIDVALIDITY")
            validade = (v[0] or b"").decode() if v and v[0] else ""
        except Exception:  # noqa: BLE001
            pass
        guardada = self.journal.meta_get("imap_uidvalidity")
        if guardada is not None and validade and guardada != validade:
            logger.warning("UIDVALIDITY mudou: reprocessando a caixa (eventos repetidos são ignorados pelo servidor)")
            self.journal.meta_del("imap_last_uid")
        if validade:
            self.journal.meta_set("imap_uidvalidity", validade)

        ultimo = self.journal.meta_get("imap_last_uid")
        if ultimo is None:
            desde = _data_imap(self._hoje() - dt.timedelta(days=self.cfg.imap_first_days))
            typ, dados = conn.uid("SEARCH", None, "SINCE", desde)
            piso = 0
        else:
            piso = int(ultimo)
            typ, dados = conn.uid("SEARCH", None, "UID", f"{piso + 1}:*")
        if typ != "OK":
            raise OSError("busca IMAP falhou")
        uids = sorted(u for u in (int(x) for x in (dados[0] or b"").split()) if u > piso)

        for uid in uids[: self.cfg.imap_batch]:
            typ, partes = conn.uid("FETCH", str(uid), "(BODY.PEEK[])")  # PEEK: não marca como lido
            bruto = next((p[1] for p in (partes or []) if isinstance(p, tuple)), None)
            if typ != "OK" or bruto is None:
                logger.warning("uid %s não pôde ser lido; parando a varredura", uid)
                return
            msg = message_from_bytes(bruto, policy=policy.default)
            eventos = detectar(msg, bruto, self._conhece, self.cfg.from_address)
            if not eventos:
                cont["ignoradas"] = cont.get("ignoradas", 0) + 1
            for ev in eventos:
                r = self.api.evento_caixa(ev)
                if r.ok:
                    cont[ev["tipo"]] = cont.get(ev["tipo"], 0) + 1
                elif r.status in (400, 422):
                    logger.error("servidor recusou o evento %s do uid %s (HTTP %s): ignorado", ev["tipo"], uid, r.status)
                    cont["erros"] = cont.get("erros", 0) + 1
                else:
                    logger.warning("evento não aceito (HTTP %s %s): varredura retomada no próximo ciclo",
                                   r.status, r.dados.get("codigo", ""))
                    return
            self.journal.meta_set("imap_last_uid", uid)
