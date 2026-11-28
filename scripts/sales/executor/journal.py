"""
Diário local (SQLite) do executor.

É a memória que protege contra e-mail duplicado. Regras:
  1. A tentativa é gravada com estado DISPATCHING ANTES de abrir a conexão SMTP.
  2. Depois do SMTP, o resultado é gravado (RESULT_PENDING) ANTES de falar com a API.
  3. Só depois de o servidor confirmar o resultado a linha vira REPORTED.
  4. Na partida, DISPATCHING vira UNKNOWN (não sabemos se o servidor de e-mail aceitou);
     UNKNOWN é informado ao servidor e NUNCA reenviado — um humano concilia.

Estados: DISPATCHING -> RESULT_PENDING -> REPORTED | REJECTED
"""

from __future__ import annotations

import logging
import sqlite3
import time
from typing import Any

try:  # trava de instância única (Linux). Em outros sistemas, segue sem a trava.
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]

logger = logging.getLogger("sales.journal")

DISPATCHING = "DISPATCHING"
RESULT_PENDING = "RESULT_PENDING"
REPORTED = "REPORTED"
REJECTED = "REJECTED"

# Resultados depois dos quais NUNCA se reenvia o mesmo Message-ID.
RESULTADOS_SEM_REENVIO = ("ACCEPTED", "UNKNOWN")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  fence INTEGER NOT NULL,
  message_id_header TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  para TEXT NOT NULL DEFAULT '',
  despacho_token TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  outcome TEXT,
  smtp_response TEXT,
  note TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_header ON attempts(message_id_header);
CREATE INDEX IF NOT EXISTS attempts_state ON attempts(state);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


class JournalLockedError(Exception):
    """Outra instância do executor já usa este diário."""


class Journal:
    def __init__(self, path: str, trava: bool = True) -> None:
        self.path = path
        self._lock_file = None
        if trava and fcntl is not None and path != ":memory:":
            self._lock_file = open(path + ".lock", "w")
            try:
                fcntl.flock(self._lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise JournalLockedError(f"já existe outro executor usando {path}") from None
        self.db = sqlite3.connect(path, isolation_level=None)  # autocommit: cada gravação é durável
        self.db.row_factory = sqlite3.Row
        if path != ":memory:":
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript(_SCHEMA)

    def close(self) -> None:
        self.db.close()
        if self._lock_file:
            self._lock_file.close()

    # ── tentativas ──────────────────────────────────────────────────────────

    def registrar_despacho(self, message_id: str, fence: int, header: str, content_hash: str,
                           para: str, despacho_token: str) -> int:
        """Grava DISPATCHING. Chamar ANTES de conectar ao SMTP."""
        agora = time.time()
        cur = self.db.execute(
            "INSERT INTO attempts(message_id, fence, message_id_header, content_hash, para, despacho_token,"
            " state, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (message_id, fence, header, content_hash, para, despacho_token, DISPATCHING, agora, agora),
        )
        return int(cur.lastrowid)

    def gravar_resultado(self, attempt_id: int, outcome: str, resposta: str | None, nota: str | None = None) -> None:
        self.db.execute(
            "UPDATE attempts SET state=?, outcome=?, smtp_response=?, note=COALESCE(?, note), updated_at=? WHERE id=?",
            (RESULT_PENDING, outcome, (resposta or "")[:300], nota, time.time(), attempt_id),
        )

    def marcar_informado(self, attempt_id: int, nota: str | None = None) -> None:
        self.db.execute("UPDATE attempts SET state=?, note=COALESCE(?, note), updated_at=? WHERE id=?",
                        (REPORTED, nota, time.time(), attempt_id))

    def marcar_rejeitado(self, attempt_id: int, nota: str) -> None:
        self.db.execute("UPDATE attempts SET state=?, note=?, updated_at=? WHERE id=?",
                        (REJECTED, nota[:300], time.time(), attempt_id))

    def recuperar_na_partida(self) -> list[sqlite3.Row]:
        """
        Chamar uma única vez, na partida. Toda tentativa ainda em DISPATCHING é de uma
        execução que caiu: não sabemos se o servidor de e-mail aceitou. Vira UNKNOWN e
        será informada como UNKNOWN. NUNCA é reenviada.
        """
        presas = self.db.execute("SELECT * FROM attempts WHERE state=?", (DISPATCHING,)).fetchall()
        for r in presas:
            self.gravar_resultado(r["id"], "UNKNOWN", None, "recuperada na partida: execução anterior caiu durante o envio")
            logger.warning("tentativa %s (mensagem %s) ficou em DISPATCHING: será informada como UNKNOWN, sem reenvio",
                           r["id"], r["message_id"])
        return presas

    def resultados_pendentes(self) -> list[sqlite3.Row]:
        return self.db.execute("SELECT * FROM attempts WHERE state=? ORDER BY id", (RESULT_PENDING,)).fetchall()

    def ja_enviada(self, header: str | None = None, message_id: str | None = None) -> bool:
        """
        True se já existe tentativa desta mensagem (por Message-ID do cabeçalho OU por id
        lógico) que pode ter saído: em curso, aceita ou desconhecida. Defesa em profundidade:
        mesmo que o servidor entregue de novo, o executor não reenvia.
        """
        for coluna, valor in (("message_id_header", header), ("message_id", message_id)):
            if valor is None:
                continue
            r = self.db.execute(
                f"SELECT 1 FROM attempts WHERE {coluna}=? AND (state=? OR outcome IN (?, ?)) LIMIT 1",
                (valor, DISPATCHING, *RESULTADOS_SEM_REENVIO),
            ).fetchone()
            if r is not None:
                return True
        return False

    def conhece_header(self, header: str) -> sqlite3.Row | None:
        """Tentativa (a mais recente) cujo Message-ID é `header` — usado pela caixa de entrada."""
        return self.db.execute(
            "SELECT * FROM attempts WHERE message_id_header=? ORDER BY id DESC LIMIT 1", (header,)
        ).fetchone()

    def contagem_por_estado(self) -> dict[str, int]:
        return {r["state"]: r["n"] for r in self.db.execute("SELECT state, COUNT(*) n FROM attempts GROUP BY state")}

    # ── meta (UID da caixa, parada, contadores, ritmo) ───────────────────────

    def meta_get(self, chave: str, padrao: str | None = None) -> str | None:
        r = self.db.execute("SELECT value FROM meta WHERE key=?", (chave,)).fetchone()
        return r["value"] if r else padrao

    def meta_set(self, chave: str, valor: Any) -> None:
        self.db.execute("INSERT INTO meta(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (chave, str(valor)))

    def meta_del(self, chave: str) -> None:
        self.db.execute("DELETE FROM meta WHERE key=?", (chave,))

    def meta_int(self, chave: str, padrao: int = 0) -> int:
        try:
            return int(self.meta_get(chave, str(padrao)) or padrao)
        except ValueError:
            return padrao
