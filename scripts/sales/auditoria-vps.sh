#!/usr/bin/env bash
# Auditoria SOMENTE LEITURA da VPS (V3.1, seção 16.10).
#
# Não instala, não altera, não reinicia nada, não grava arquivo. Imprime na saída padrão um
# relatório datado com a saída crua de cada verificação. Para guardar: ... | tee auditoria.txt
# Sempre termina com código 0. Cada item recebe um destes rótulos:
#   OK  |  AUSENTE  |  NÃO VERIFICADO  |  AVISO
#
# Uso:
#   bash auditoria-vps.sh [--repo CAMINHO] [--filtrados DIR] [--smtp HOST] [--imap HOST]
#                         [--envfile ARQ]... [--skills DIR]
#   --repo       clone do sal-vita-vendas na VPS
#   --filtrados  pasta de saída do importador (--save-filtered), se existir
#   --smtp/--imap hosts do provedor de e-mail (testa TCP 587/465 e 993; nenhum dado é enviado)
#   --envfile    arquivo de ambiente (ex.: o EnvironmentFile do systemd). Só os NOMES das
#                variáveis são lidos; valores nunca são impressos
#   --skills     pasta de skills do Hermes
#
# ATENÇÃO: o relatório pode conter endereços IP locais e nomes de serviços. Não cole em lugar público.

set -u
set -o pipefail

REPO=""; FILTRADOS=""; SMTP_HOST=""; IMAP_HOST=""; SKILLS=""
ENVFILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --filtrados) FILTRADOS="${2:-}"; shift 2 ;;
    --smtp) SMTP_HOST="${2:-}"; shift 2 ;;
    --imap) IMAP_HOST="${2:-}"; shift 2 ;;
    --envfile) ENVFILES+=("${2:-}"); shift 2 ;;
    --skills) SKILLS="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "argumento desconhecido: $1 (use --help)"; shift ;;
  esac
done
[ ${#ENVFILES[@]} -eq 0 ] && ENVFILES=(/etc/sales-executor.env /etc/radar-enricher.env)

tem() { command -v "$1" >/dev/null 2>&1; }
# systemd realmente utilizável (o comando pode existir sem o systemd ser o init, como em contêineres)
SYSTEMD_OK=0
if tem systemctl && systemctl list-units --type=service --no-pager --plain >/dev/null 2>&1; then SYSTEMD_OK=1; fi
secao() { printf '\n=== %s ===\n' "$1"; }
item() { printf '[%s] %s\n' "$1" "$2"; }
# Executa um comando de leitura e imprime a saída crua, recuada.
cru() {
  local saida
  saida="$("$@" 2>&1)" || true
  if [ -n "$saida" ]; then printf '%s\n' "$saida" | while IFS= read -r l; do printf '    %s\n' "$l"; done; fi
}

printf 'AUDITORIA DA VPS (somente leitura) - %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
printf 'Aviso: pode conter IPs locais e nomes de serviços; não publique.\n'

# ── 1. Sistema ───────────────────────────────────────────────────────────────────────────────
secao "Sistema"
if [ -r /etc/os-release ]; then
  item OK "sistema operacional"; cru grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release
else
  item "NÃO VERIFICADO" "sistema operacional (/etc/os-release ilegível)"
fi
cru uname -srm
if tem nproc; then item OK "CPU: $(nproc) núcleo(s)"; else item "NÃO VERIFICADO" "CPU (nproc ausente)"; fi
if tem lscpu; then cru bash -c "lscpu | grep -E '^(Model name|CPU\\(s\\))'"; fi
if tem free; then item OK "memória"; cru free -h; else item "NÃO VERIFICADO" "memória (free ausente)"; fi

secao "Disco"
ALVO="${REPO:-/}"
[ -d "$ALVO" ] || ALVO="/"
if tem df; then
  cru df -h "$ALVO"
  LIVRE_GB="$(df -BG --output=avail "$ALVO" 2>/dev/null | tail -n 1 | tr -dc '0-9')"
  if [ -n "${LIVRE_GB:-}" ]; then
    if [ "$LIVRE_GB" -lt 20 ]; then
      item AVISO "apenas ${LIVRE_GB} GB livres em $ALVO (a importação da Receita precisa de ~15 GB temporários; recomendado >= 20 GB)"
    else
      item OK "${LIVRE_GB} GB livres em $ALVO (>= 20 GB)"
    fi
  else
    item "NÃO VERIFICADO" "espaço livre (df não informou em GB)"
  fi
else
  item "NÃO VERIFICADO" "disco (df ausente)"
fi

# ── 2. Serviços e portas ─────────────────────────────────────────────────────────────────────
secao "Serviços em execução"
if [ "$SYSTEMD_OK" -eq 1 ]; then
  item OK "systemctl disponível"
  cru systemctl list-units --type=service --state=running --no-pager --plain
else
  item "NÃO VERIFICADO" "serviços (systemctl ausente ou systemd não é o init)"
fi
secao "Portas em escuta"
if tem ss; then
  item OK "ss disponível"; cru ss -tln
elif tem netstat; then
  item OK "netstat disponível"; cru netstat -tln
else
  item "NÃO VERIFICADO" "portas (ss e netstat ausentes)"
fi

# ── 3. Repositório e enricher ────────────────────────────────────────────────────────────────
secao "Repositório"
if [ -z "$REPO" ]; then
  item "NÃO VERIFICADO" "clone do repositório (passe --repo CAMINHO)"
elif [ ! -e "$REPO/.git" ]; then
  item AUSENTE "clone do repositório em $REPO"
elif ! tem git; then
  item "NÃO VERIFICADO" "git ausente"
else
  item OK "clone do repositório em $REPO"
  printf '    commit: %s\n' "$(git --no-optional-locks -C "$REPO" rev-parse HEAD 2>&1)"
  printf '    branch: %s\n' "$(git --no-optional-locks -C "$REPO" rev-parse --abbrev-ref HEAD 2>&1)"
  printf '    data do commit: %s\n' "$(git --no-optional-locks -C "$REPO" log -1 --format=%cI 2>&1)"
  item OK "git status (alterações locais, se houver)"
  cru git --no-optional-locks -C "$REPO" status --short
  for d in scripts/radar/enricher scripts/sales/executor scripts/radar/import-receita.ts; do
    if [ -e "$REPO/$d" ]; then item OK "presente no clone: $d"; else item AUSENTE "ausente no clone: $d (clone desatualizado?)"; fi
  done
fi

secao "Serviço do enricher do Radar"
if [ "$SYSTEMD_OK" -eq 1 ]; then
  ACHOU=0
  for u in radar-enricher enricher; do
    if systemctl list-unit-files --no-pager 2>/dev/null | grep -q "^${u}\.service"; then
      ACHOU=1
      item OK "unidade ${u}.service instalada (estado: $(systemctl is-active "$u" 2>&1))"
      cru systemctl status "$u" --no-pager -n 5
    fi
  done
  [ "$ACHOU" -eq 0 ] && item AUSENTE "unidade do enricher (procurei radar-enricher e enricher)"
else
  item "NÃO VERIFICADO" "enricher (systemd indisponível)"
fi
secao "Serviço do executor de vendas"
if [ "$SYSTEMD_OK" -eq 1 ]; then
  if systemctl list-unit-files --no-pager 2>/dev/null | grep -q '^sales-executor\.service'; then
    item OK "sales-executor.service instalado (estado: $(systemctl is-active sales-executor 2>&1))"
  else
    item AUSENTE "sales-executor.service (ainda não instalado)"
  fi
else
  item "NÃO VERIFICADO" "executor (systemd indisponível)"
fi

# ── 4. Importador da Receita ─────────────────────────────────────────────────────────────────
secao "Importador da Receita"
if tem pgrep && pgrep -af 'import-receita' >/dev/null 2>&1; then
  item OK "importador em execução agora"; cru pgrep -af import-receita
else
  item AUSENTE "importador em execução agora"
fi
if [ -n "$FILTRADOS" ]; then
  if [ -d "$FILTRADOS" ]; then
    item OK "pasta de arquivos filtrados: $FILTRADOS"
    cru ls -lh "$FILTRADOS"
    cru du -sh "$FILTRADOS"
  else
    item AUSENTE "pasta de arquivos filtrados: $FILTRADOS"
  fi
else
  item "NÃO VERIFICADO" "arquivos filtrados (passe --filtrados DIR)"
fi
LOGS="$(ls -1 /var/log/*receita* /var/log/*radar* 2>/dev/null)"
if [ -n "$LOGS" ]; then item OK "logs encontrados em /var/log"; printf '%s\n' "$LOGS" | sed 's/^/    /'; else item AUSENTE "logs do importador em /var/log"; fi
if tem journalctl; then
  JR="$(journalctl --no-pager -q -n 5 -u 'radar-*' 2>/dev/null)"
  if [ -n "$JR" ]; then item OK "journal de unidades radar-*"; cru journalctl --no-pager -q -n 5 -u 'radar-*'; else item AUSENTE "journal de unidades radar-* (ou sem permissão de leitura)"; fi
fi

# ── 5. Runtimes ──────────────────────────────────────────────────────────────────────────────
secao "Python"
if tem python3; then
  item OK "python3: $(python3 --version 2>&1)"
  if python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    item OK "versão >= 3.10 (exigida pelo executor)"
  else
    item AVISO "python3 abaixo de 3.10: o executor exige 3.10 ou mais"
  fi
else
  item AUSENTE "python3"
fi
secao "Node"
if tem node; then
  item OK "node: $(node --version 2>&1)"
  tem npm && item OK "npm: $(npm --version 2>&1)"
else
  item AUSENTE "node (o importador da Receita usa Node 20+)"
fi

# ── 6. Conectividade de saída (sem enviar dados) ─────────────────────────────────────────────
sonda() { # host porta -> 0 se a conexão TCP abrir em 6 s; fecha em seguida, sem enviar nada
  timeout 6 bash -c 'exec 3<>"/dev/tcp/$0/$1"' "$1" "$2" >/dev/null 2>&1
}
secao "Conectividade TCP de saída"
if ! tem timeout; then
  item "NÃO VERIFICADO" "conectividade (comando timeout ausente)"
else
  if [ -n "$SMTP_HOST" ]; then
    for p in 587 465; do
      if sonda "$SMTP_HOST" "$p"; then item OK "SMTP $SMTP_HOST:$p alcançável"; else item AUSENTE "SMTP $SMTP_HOST:$p sem conexão (bloqueado ou fechado)"; fi
    done
  else
    item "NÃO VERIFICADO" "SMTP 587/465 (passe --smtp HOST)"
  fi
  if [ -n "$IMAP_HOST" ]; then
    if sonda "$IMAP_HOST" 993; then item OK "IMAP $IMAP_HOST:993 alcançável"; else item AUSENTE "IMAP $IMAP_HOST:993 sem conexão (bloqueado ou fechado)"; fi
  else
    item "NÃO VERIFICADO" "IMAP 993 (passe --imap HOST)"
  fi
fi

# ── 7. Variáveis de ambiente esperadas (SÓ OS NOMES) ─────────────────────────────────────────
nome_em_arquivo() { # nome arquivo -> 0 se "NOME=" existe; nunca imprime o valor
  grep -Eq "^[[:space:]]*(export[[:space:]]+)?$1=" "$2" 2>/dev/null
}
verifica_nomes() { # rótulo nome...
  local rotulo="$1"; shift
  secao "Variáveis esperadas: $rotulo (nomes; valores nunca são lidos nem impressos)"
  local n f onde lido
  for n in "$@"; do
    onde=""
    [ -n "${!n-}" ] && onde="ambiente atual"
    for f in "${ENVFILES[@]}"; do
      if [ -r "$f" ]; then
        lido=1
        nome_em_arquivo "$n" "$f" && onde="${onde:+$onde, }$f"
      fi
    done
    if [ -n "$onde" ]; then item OK "$n ($onde)"
    elif [ -z "${lido:-}" ] && [ "${#ENVFILES[@]}" -gt 0 ]; then item "NÃO VERIFICADO" "$n (ausente do ambiente atual; arquivos de ambiente ilegíveis, talvez rode como root?)"
    else item AUSENTE "$n"; fi
  done
}
verifica_nomes "executor de vendas" \
  SALES_API_URL SALES_HERMES_SECRET_DISPATCH SALES_HERMES_SECRET_READ SALES_HERMES_SECRET_PROPOSE \
  SALES_EXECUTOR_ID SALES_SMTP_HOST SALES_SMTP_PORT SALES_SMTP_SECURITY SALES_SMTP_USER SALES_SMTP_PASSWORD \
  SALES_IMAP_HOST SALES_IMAP_PORT SALES_IMAP_USER SALES_IMAP_PASSWORD SALES_FROM_NAME SALES_FROM_ADDRESS \
  SALES_REPLY_TO SALES_PACING_SECONDS SALES_MAX_PER_CYCLE SALES_DRY_RUN SALES_JOURNAL_PATH \
  SALES_CYCLE_SECONDS SALES_JANELA
verifica_nomes "enricher do Radar" DATABASE_URL RADAR_MUNICIPIOS_JSON RADAR_ENRICH_POLL_SECONDS ENRICH_DISABLE

# ── 8. Skills do Hermes ──────────────────────────────────────────────────────────────────────
secao "Skills do Hermes"
if [ -z "$SKILLS" ]; then
  item "NÃO VERIFICADO" "pasta de skills (passe --skills DIR)"
elif [ ! -d "$SKILLS" ]; then
  item AUSENTE "pasta de skills: $SKILLS"
else
  item OK "pasta de skills: $SKILLS"
  cru ls -1 "$SKILLS"
  for s in salvita-prospeccao salvita-inteligencia-comercial salvita-vendas salvita-relacionamento salvita-auditoria; do
    if [ -e "$SKILLS/$s" ]; then item OK "skill $s"; else item AUSENTE "skill $s"; fi
  done
fi

# ── 9. Contagens do banco (opcional, só SELECT) ──────────────────────────────────────────────
secao "Banco (contagens; só SELECT)"
if [ -z "${DATABASE_URL:-}" ]; then
  item "NÃO VERIFICADO" "banco (DATABASE_URL não está no ambiente deste shell)"
elif ! tem psql; then
  item "NÃO VERIFICADO" "banco (psql ausente)"
else
  export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=15000"
  item OK "psql com sessão somente leitura"
  printf '    radar_establishments por UF:\n'
  psql "$DATABASE_URL" -X -A -t -F ' | ' -c "SELECT uf, count(*) FROM radar_establishments GROUP BY uf ORDER BY uf" 2>&1 | sed 's/^/      /'
  printf '    radar_enrichment por status:\n'
  psql "$DATABASE_URL" -X -A -t -F ' | ' -c "SELECT status, count(*) FROM radar_enrichment GROUP BY status ORDER BY status" 2>&1 | sed 's/^/      /'
fi

printf '\nFim da auditoria. Nenhuma alteração foi feita neste servidor.\n'
exit 0
