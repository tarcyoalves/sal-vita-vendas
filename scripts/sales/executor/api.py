"""
Cliente HTTP das rotas /api/sales/* (contrato em shared/sales.ts).

Cada rota usa o segredo do SEU escopo (`Authorization: Bearer <segredo>`):
  leitura   -> GET /modo, GET /relatorio, POST /heartbeat
  despacho  -> POST /fila/reservar, /envio/:id/autorizar, /envio/:id/resultado, /caixa/eventos
  propostas -> POST /propostas

O segredo nunca é logado. 401 vira `ApiAuthError` (o worker para e avisa).
Só biblioteca padrão (urllib).
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

import config

logger = logging.getLogger("sales.api")

USER_AGENT = f"sal-vita-sales-executor/{config.VERSAO}"


class ApiAuthError(Exception):
    """A API respondeu 401 (ou o segredo do escopo não existe): parar e avisar."""


class ApiNetworkError(Exception):
    """Sem resposta (DNS, conexão, timeout) ou 5xx do servidor."""


@dataclass
class Resposta:
    status: int
    dados: dict[str, Any]

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


class Api:
    def __init__(self, cfg: config.Config, opener: Callable[..., Any] | None = None,
                 sleep: Callable[[float], None] = time.sleep) -> None:
        self.cfg = cfg
        # `opener` injetável para teste; em produção é urllib.request.urlopen.
        self._open = opener or urllib.request.urlopen
        self._sleep = sleep

    # ── núcleo ──────────────────────────────────────────────────────────────

    def montar(self, escopo: str, metodo: str, caminho: str, corpo: dict | None = None,
               query: dict | None = None) -> urllib.request.Request:
        segredo = self.cfg.secret_para(escopo)
        if not segredo:
            raise ApiAuthError(f"segredo do escopo '{escopo}' não configurado")
        url = f"{self.cfg.api_url}{caminho}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8") if corpo is not None else None
        req = urllib.request.Request(url, data=dados, method=metodo)
        req.add_header("Authorization", f"Bearer {segredo}")
        req.add_header("Accept", "application/json")
        req.add_header("User-Agent", USER_AGENT)
        if dados is not None:
            req.add_header("Content-Type", "application/json; charset=utf-8")
        return req

    def chamar(self, escopo: str, metodo: str, caminho: str, corpo: dict | None = None,
               query: dict | None = None) -> Resposta:
        req = self.montar(escopo, metodo, caminho, corpo, query)
        try:
            with self._open(req, timeout=self.cfg.api_timeout) as r:
                status, bruto = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, bruto = e.code, e.read()
        except (urllib.error.URLError, OSError, TimeoutError) as e:
            raise ApiNetworkError(f"{metodo} {caminho}: {type(e).__name__}") from None
        try:
            dados = json.loads(bruto.decode("utf-8")) if bruto else {}
            if not isinstance(dados, dict):
                dados = {"valor": dados}
        except (ValueError, UnicodeDecodeError):
            dados = {}
        if status == 401:
            raise ApiAuthError(f"{metodo} {caminho} respondeu 401")
        # 503 é resposta de "rota fechada / indisponível" e o chamador decide; os demais 5xx são rede.
        if status >= 500 and status != 503:
            raise ApiNetworkError(f"{metodo} {caminho} respondeu {status}")
        return Resposta(status, dados)

    # ── rotas ───────────────────────────────────────────────────────────────

    def modo(self) -> Resposta:
        return self.chamar("leitura", "GET", "/api/sales/modo")

    def heartbeat(self, ciclo: int, contagens: dict[str, int]) -> Resposta:
        return self.chamar("leitura", "POST", "/api/sales/heartbeat", {
            "executor": self.cfg.executor_id, "versao": config.VERSAO,
            "ciclo": ciclo, "contagens": contagens,
        })

    def reservar(self, maximo: int) -> Resposta:
        return self.chamar("despacho", "POST", "/api/sales/fila/reservar",
                           {"executor": self.cfg.executor_id, "max": maximo})

    def autorizar(self, message_id: str, reserva_token: str, fence: int) -> Resposta:
        caminho = f"/api/sales/envio/{urllib.parse.quote(str(message_id), safe='')}/autorizar"
        return self.chamar("despacho", "POST", caminho, {
            "executor": self.cfg.executor_id, "reservaToken": reserva_token, "fence": fence,
        })

    def resultado(self, message_id: str, despacho_token: str, resultado: str,
                  resposta_smtp: str | None) -> Resposta:
        corpo: dict[str, Any] = {
            "executor": self.cfg.executor_id, "despachoToken": despacho_token, "resultado": resultado,
        }
        if resposta_smtp:
            corpo["respostaSmtp"] = resposta_smtp[:300]
        caminho = f"/api/sales/envio/{urllib.parse.quote(str(message_id), safe='')}/resultado"
        return self.chamar("despacho", "POST", caminho, corpo)

    def resultado_com_retentativa(self, message_id: str, despacho_token: str, resultado: str,
                                  resposta_smtp: str | None, tentativas: int = 5) -> Resposta | None:
        """Backoff exponencial (2, 4, 8, 16 s). None = não conseguiu falar com o servidor."""
        espera = 2.0
        for i in range(tentativas):
            try:
                r = self.resultado(message_id, despacho_token, resultado, resposta_smtp)
                if r.status != 503:
                    return r
                logger.warning("resultado: servidor respondeu 503 (tentativa %d)", i + 1)
            except ApiNetworkError as e:
                logger.warning("resultado: %s (tentativa %d)", e, i + 1)
            if i < tentativas - 1:
                self._sleep(espera)
                espera *= 2
        return None

    def evento_caixa(self, evento: dict[str, Any]) -> Resposta:
        return self.chamar("despacho", "POST", "/api/sales/caixa/eventos", evento)

    def proposta(self, proposta: dict[str, Any]) -> Resposta:
        return self.chamar("propostas", "POST", "/api/sales/propostas", proposta)
