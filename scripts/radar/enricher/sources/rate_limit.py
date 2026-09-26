"""
Limitador de taxa por fonte (educação com quem hospeda os dados).

`RateLimiter.wait(key)` dorme o quanto for preciso para respeitar o
intervalo mínimo configurado para aquela chave (fonte, ou "domínio:site.com"
para o rate limit por domínio do source `site`), com uma variação aleatória
(jitter) para não ficar num padrão robótico e previsível.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field

import config


@dataclass
class RateLimiter:
    min_interval_seconds: dict = field(default_factory=lambda: dict(config.RATE_LIMIT_SECONDS))
    jitter_seconds: float = config.RATE_LIMIT_JITTER_SECONDS
    _last_call: dict = field(default_factory=dict)

    def wait(self, key: str, *, min_interval: float | None = None) -> None:
        interval = min_interval if min_interval is not None else self.min_interval_seconds.get(key, 2.0)
        last = self._last_call.get(key)
        now = time.monotonic()
        if last is not None:
            elapsed = now - last
            remaining = interval - elapsed
            if remaining > 0:
                time.sleep(remaining + random.uniform(0, self.jitter_seconds))
        self._last_call[key] = time.monotonic()
