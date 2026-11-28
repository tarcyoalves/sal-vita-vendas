"""A auditoria da VPS é SOMENTE LEITURA: o script não pode conter comando que escreva ou altere."""

import os
import re
import shutil
import subprocess
import unittest

import helpers  # noqa: F401

SCRIPT = os.path.abspath(os.path.join(helpers.EXECUTOR_DIR, "..", "auditoria-vps.sh"))

PROIBIDOS = {
    "rm": r"\brm\b", "mv": r"\bmv\b", "cp": r"\bcp\b", "apt": r"\bapt(-get)?\b", "dpkg": r"\bdpkg\b",
    "systemctl que altera": r"systemctl\s+(restart|stop|start|enable|disable|reload|daemon-reload|mask|kill)\b",
    "pip install": r"\bpip3?\s+install\b", "npm install": r"\bnpm\s+(install|i|ci|update)\b",
    "sudo": r"\bsudo\b", "kill": r"\b(kill|pkill|killall)\b", "tee": r"\btee\b",
    "chmod/chown": r"\b(chmod|chown|truncate|dd|ln|mkdir|touch)\b", "eval": r"\beval\b",
    "sed -i": r"\bsed\s+(-[a-zA-Z]*i|--in-place)",
    "SQL de escrita": r"(?i)\b(insert|update|delete|drop|alter|truncate|grant|create)\b",
    "git que escreve": r"\bgit\b[^|;&]*\b(add|commit|push|pull|fetch|checkout|reset|clean|merge|rebase|stash|init|clone)\b",
}


def _tira_comentario(linha: str) -> str:
    aspas = None
    for i, c in enumerate(linha):
        if aspas:
            if c == aspas:
                aspas = None
        elif c in "'\"":
            aspas = c
        elif c == "#" and (i == 0 or linha[i - 1].isspace()):
            return linha[:i]
    return linha


def _linhas_de_codigo():
    with open(SCRIPT, encoding="utf-8") as f:
        for n, linha in enumerate(f, 1):
            codigo = _tira_comentario(linha.rstrip("\n"))
            if codigo.strip():
                yield n, codigo


class AuditoriaSomenteLeitura(unittest.TestCase):
    def test_sem_comandos_de_escrita(self):
        for n, codigo in _linhas_de_codigo():
            for nome, padrao in PROIBIDOS.items():
                with self.subTest(linha=n, regra=nome):
                    self.assertIsNone(re.search(padrao, codigo), f"linha {n}: {codigo.strip()}")

    def test_redirecionamentos_so_para_dev_null_ou_descritor(self):
        for n, codigo in _linhas_de_codigo():
            sem_aspas = re.sub(r"'[^']*'|\"[^\"]*\"", '""', codigo)
            for m in re.finditer(r"(?<![<>&])(\d*>>?)\s*(\S*)", sem_aspas):
                alvo = m.group(2).rstrip(";)|")
                with self.subTest(linha=n):
                    self.assertTrue(alvo == "/dev/null" or alvo.startswith("&"),
                                    f"linha {n}: redireciona para {alvo!r}: {codigo.strip()}")

    def test_so_leitura_no_banco(self):
        with open(SCRIPT, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("default_transaction_read_only=on", texto)
        for m in re.finditer(r"-c\s+\"([^\"]*)\"", texto):
            if "FROM" in m.group(1):
                self.assertTrue(m.group(1).lstrip().upper().startswith("SELECT"), m.group(1))

    def test_nao_imprime_valores_de_variaveis(self):
        with open(SCRIPT, encoding="utf-8") as f:
            texto = f.read()
        self.assertNotIn("printenv", texto)
        self.assertNotRegex(texto, r"\b(env|set|export)\s*(\||$)")
        self.assertNotRegex(texto, r"echo\s+\"?\$\{?!?n\b")

    @unittest.skipUnless(shutil.which("bash"), "bash ausente")
    def test_sintaxe_e_execucao_sem_vazar_segredo(self):
        self.assertEqual(subprocess.run(["bash", "-n", SCRIPT]).returncode, 0)
        env = dict(os.environ, SALES_HERMES_SECRET_READ="SEGREDO-NAO-PODE-APARECER-123",
                   DATABASE_URL="")
        r = subprocess.run(["bash", SCRIPT], capture_output=True, text=True, env=env, timeout=120)
        self.assertEqual(r.returncode, 0)
        self.assertNotIn("SEGREDO-NAO-PODE-APARECER-123", r.stdout + r.stderr)
        self.assertIn("SALES_HERMES_SECRET_READ (ambiente atual)", r.stdout)
        self.assertRegex(r.stdout, r"\[(OK|AUSENTE|NÃO VERIFICADO|AVISO)\]")


if __name__ == "__main__":
    unittest.main()
