"""
Disjuntor (circuit breaker) por fonte.

Quando uma fonte dá sinal de bloqueio (captcha, "tráfego incomum", HTTP
403/429...), ela fica pausada por um tempo — as outras fontes continuam
normalmente. Nunca tenta resolver o bloqueio, só espera.

Vive só na memória do processo: cada reinício do worker começa "zerado" (é o
comportamento certo — se o bloqueio ainda estiver de pé, a fonte é pausada de
novo assim que detectar o próximo sinal).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import config

logger = logging.getLogger("radar_enricher.circuit_breaker")


@dataclass
class CircuitBreaker:
    pause_minutes: float = config.CIRCUIT_BREAKER_PAUSE_MINUTES
    _paused_until: dict = field(default_factory=dict)

    def is_paused(self, source: str) -> bool:
        until = self._paused_until.get(source)
        return until is not None and time.monotonic() < until

    def trip(self, source: str, reason: str) -> None:
        self._paused_until[source] = time.monotonic() + self.pause_minutes * 60
        logger.warning(
            "fonte '%s' pausada por %.0f min — motivo: %s", source, self.pause_minutes, reason
        )

    def note_if_paused(self, source: str) -> str | None:
        if self.is_paused(source):
            return "pausado: bloqueio"
        return None
