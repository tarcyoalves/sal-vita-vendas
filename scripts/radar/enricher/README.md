# Enriquecedor do Radar de Cargas (robô Python, roda na VPS do dono)

Consome a fila `radar_enrichment` (o CRM grava linha com `status='pendente'`
quando um atendente busca no Radar) e, para cada CNPJ, varre a web pública:
**buscador → site da empresa → Google Maps → Instagram/Facebook públicos**.
Grava o resultado de volta em `radar_enrichment.result` no formato
`RadarEnrichmentData` (`shared/radar.ts`). Ver `PLANO-RADAR-CARGAS.md` para o
desenho geral do Radar de Cargas.

Roda **fora da Vercel**, na VPS do dono, por fora do deploy do CRM — igual ao
importador em `scripts/radar/import-receita.ts` (mesma VPS, mesmo princípio:
o CRM só lê o que este robô grava no banco).

## O que este robô NÃO faz (importante)

- **Nunca resolve captcha.** Ao detectar um sinal de bloqueio (captcha,
  "tráfego incomum", HTTP 403/429), a fonte afetada fica pausada por um
  tempo (disjuntor) e o robô segue com as outras fontes.
- **Nunca faz login** em Instagram/Facebook, nunca cria conta, nunca usa
  cookie de conta real. Perfil que exige login fica só com a URL guardada e
  a nota `"perfil exige login"`.
- **Nunca envia mensagem nenhuma.** Só lê dado público e grava no banco — o
  envio ao cliente é sempre manual, pelo atendente, no link `wa.me` que a
  tela do Radar monta (ver `shared/radar.ts`, `waMeLink`).
- **Nunca guarda a página HTML inteira**, nem dado pessoal além de contato
  comercial (telefone/e-mail/WhatsApp/redes sociais e o que aparece no Maps).
- **Não finge ser o Googlebot** nem outro rastreador — o User-Agent se
  identifica (`config.USER_AGENT`, pode trocar por variável de ambiente).

## Instalação na VPS

Requer Python 3.10+ (foi testado com 3.11).

```bash
cd sal-vita-vendas/scripts/radar/enricher
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Baixa os browsers que o Scrapling usa para Google Maps (StealthyFetcher) e
# fontes dinâmicas (DynamicFetcher) — é obrigatório, sem isso a fonte "maps"
# nunca funciona. Baixa um Chromium (~200 MB); rode uma vez só.
.venv/bin/scrapling install
```

Se `scrapling install` reclamar de dependência de sistema faltando (bibliotecas
do Chromium/Playwright), rode o instalador de dependências que ele indicar —
em Debian/Ubuntu costuma ser algo como:

```bash
.venv/bin/python3 -m playwright install-deps chromium
```

(depende da versão do Scrapling — confira a saída do comando, ela já diz o
que falta).

## Variáveis de ambiente

**Nunca coloque nenhuma dessas num arquivo do repositório — ele é público.**
Configure num arquivo fora do git, por exemplo `/etc/radar-enricher.env`
(permissão 600), e aponte o systemd para ele (`EnvironmentFile=`, ver
`enricher.service`).

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | **sim** | Connection string do Neon do CRM (a mesma do `.env` da Vercel) |
| `RADAR_MUNICIPIOS_JSON` | não | Caminho para `server/data/municipios.json`, se o robô rodar fora de uma cópia completa do repositório. Padrão: relativo a este arquivo (`../../../server/data/municipios.json`) |
| `RADAR_ENRICH_POLL_SECONDS` | não | Intervalo de checagem da fila quando vazia (padrão 5s) |
| `RADAR_ENRICH_TTL_DAYS` | não | Validade do resultado em dias (padrão 30 — precisa bater com `RADAR_ENRICH_TTL_DAYS` em `shared/radar.ts`) |
| `RADAR_ENRICH_RATE_BUSCA` / `_MAPS` / `_SOCIAL` / `_SITE` | não | Segundos mínimos entre requisições de cada fonte (padrões: 4 / 20 / 15 / 2) |
| `RADAR_ENRICH_JITTER` | não | Variação aleatória somada ao intervalo mínimo, em segundos (padrão 1,5) |
| `RADAR_ENRICH_BREAKER_MINUTES` | não | Minutos que uma fonte fica pausada após bloqueio (padrão 60) |
| `RADAR_ENRICH_USER_AGENT` | não | User-Agent enviado nas requisições HTTP simples (busca/site/social). **Mantenha só ASCII** — um acento aqui já quebrou a codificação de header do `curl_cffi` durante o desenvolvimento (ver nota em `config.py`) |
| `RADAR_ENRICH_MAPS_HEADLESS` | não | `"false"` para rodar o browser do Maps com tela (debug visual na VPS com X) — padrão `true` |
| `RADAR_ENRICH_PAGE_TIMEOUT` | não | Timeout por página do source `site`, em segundos (padrão 10) |
| `ENRICH_DISABLE` | não | Lista separada por vírgula de fontes para desligar, ex.: `maps,social` |

## Como rodar

Manual (primeiro teste):

```bash
cd sal-vita-vendas/scripts/radar/enricher
set -a; source /etc/radar-enricher.env; set +a
.venv/bin/python3 worker.py
```

Ctrl+C encerra depois do trabalho em andamento (o robô trata `SIGINT`/`SIGTERM`
e não derruba um CNPJ no meio do processamento).

## Rodando de verdade: systemd

Exemplo completo em `enricher.service` (comentários com o passo a passo).
Resumo:

```bash
sudo cp enricher.service /etc/systemd/system/radar-enricher.service
# edite WorkingDirectory/ExecStart/User no arquivo copiado, se necessário
sudo systemctl daemon-reload
sudo systemctl enable --now radar-enricher
sudo systemctl status radar-enricher
```

O `Restart=on-failure` no unit já cobre queda por erro; o robô também tenta
reconectar sozinho ao banco se a conexão cair no meio do loop.

## Logs

`worker.py` usa o `logging` padrão do Python, formato
`AAAA-MM-DD HH:MM:SS NÍVEL nome.do.módulo: mensagem`, para stdout/stderr —
o systemd já captura isso no journal:

```bash
journalctl -u radar-enricher -f          # acompanhar ao vivo
journalctl -u radar-enricher --since "1 hour ago"
```

Cada trabalho processado loga quais fontes deram certo
(`cnpj=... enriquecido: ['busca', 'site']`, por exemplo). Um `WARNING` avisa
quando uma fonte é pausada pelo disjuntor, com o motivo.

## Como pausar uma fonte manualmente

Duas formas:

1. **Permanente (até você mudar de novo):** `ENRICH_DISABLE=maps,social` no
   arquivo de ambiente e reinicie o serviço. A fonte nem tenta rodar; o
   registro em `fontes` fica com `ok:false, note:"desabilitado"`.
2. **Automática e temporária:** já acontece sozinho quando uma fonte é
   bloqueada (captcha/HTTP 403/429) — fica pausada por
   `RADAR_ENRICH_BREAKER_MINUTES` (padrão 60 min) e volta sozinha depois.
   Não precisa fazer nada; se quiser só ver o estado, acompanhe os `WARNING`
   no log.

## "Robô offline" no CRM

A tela do Radar mostra "robô offline" quando o heartbeat
(`app_settings.radar_enricher_heartbeat`, atualizado a cada volta do loop) tem
mais de `RADAR_ENRICHER_ONLINE_MS` (3 minutos, `shared/radar.ts`). Se aparecer
isso com o `systemctl status` dizendo "active", confira:

- `DATABASE_URL` aponta para o banco certo (o mesmo `DATABASE_URL` da Vercel);
- o log não está preso num loop de reconexão (`journalctl -u radar-enricher`).

## Fontes e o que cada uma alimenta

Ordem de execução por CNPJ — cada uma roda isolada; uma falhando nunca aborta
as outras (ver `worker.py:process_job`):

1. **`busca`** — DuckDuckGo HTML (`html.duckduckgo.com/html/`), com Bing HTML
   como reserva se o DuckDuckGo não trouxer nada. Acha o site oficial
   (descartando diretórios de CNPJ, redes sociais, etc. — pontuação por
   sobreposição de palavras do nome com o domínio, `extract.score_website_candidate`)
   e perfis de Instagram/Facebook citados nos resultados.
2. **`site`** — abre a home do site achado e, no máximo, 2 páginas de
   contato linkadas a partir dela (`contato`, `fale-conosco`, `atendimento`,
   `sobre`). Respeita `robots.txt`. Tira wa.me/api.whatsapp.com → `whatsapps`,
   `tel:`/texto → `telefones`, `mailto:`/texto → `emails`, e links de
   Instagram/Facebook.
3. **`maps`** — busca `"<nome> <cidade> <UF>"` no Google Maps com um browser
   de verdade (Scrapling `StealthyFetcher`). Só aceita o primeiro lugar
   encontrado se o nome bater com a empresa (sobreposição de palavras) OU o
   endereço citar a cidade buscada — senão `ok:false, note:"nenhum resultado
   compatível"`.
4. **`social`** — abre (sem login) os perfis de Instagram/Facebook achados
   nas fontes anteriores e lê só o que está visível na bio pública.

## Ponto mais frágil: seletores do Google Maps

O HTML de busca do Google Maps muda com frequência e não tem versão de API
gratuita equivalente. `extract.parse_maps_place` tenta usar âncoras
relativamente estáveis:

- `a[data-item-id="authority"]` → site oficial
- `[data-item-id^="phone:tel:"]` → telefone
- `aria-label` com padrão `"<nota> estrelas <n> avaliações"` → nota/avaliações
- `h1` (página de lugar) ou `a.hfpxzc[aria-label]` (lista de busca) → nome
- `button[jsaction*="category"]` → categoria
- texto contendo `"fechado permanentemente"`/`"aberto"` etc. → situação

Se o Google mudar essas classes/atributos (acontece), a fonte `maps` passa a
devolver `ok:false, note:"nenhum resultado"` de forma silenciosa — não
quebra o robô, só para de trazer dado do Maps. Quando isso acontecer, o
conserto é só em `extract.parse_maps_place` (testes com fixture em
`tests/fixtures/maps_place_match.html`).

## Testes (offline, sem rede)

```bash
cd sal-vita-vendas
python3 -m venv .venv-enricher-test        # ambiente separado, fora do repo funciona também
.venv-enricher-test/bin/pip install -r scripts/radar/enricher/requirements-dev.txt
.venv-enricher-test/bin/python3 -m pytest scripts/radar/enricher/tests -q
```

Os testes usam só fixtures HTML sintéticas salvas em `tests/fixtures/` — não
fazem nenhuma requisição de rede. Cobrem: normalização de telefone (rejeita
CNPJ/CEP/sequência), extração de wa.me, extração/rejeição de e-mail (arquivo
de imagem, domínio de placeholder, artefato de biblioteca JS tipo
`lenis@1.0.22`), filtro de domínio-diretório e pontuação de site, parsing de
resultado do DuckDuckGo (bloqueado e normal) e do Bing (incluindo
desembrulhar o redirect `bing.com/ck/a?...&u=a1<base64>`), parsing de lugar
do Maps (compatível e incompatível), detecção de login wall, comportamento
do disjuntor, e validação de forma do resultado final contra
`RadarEnrichmentData`.

## Onde cada coisa vive

| Arquivo | O quê |
|---|---|
| `worker.py` | Loop principal: heartbeat, claim da fila, chama as 4 fontes, monta e grava o resultado |
| `config.py` | Tudo que vem do ambiente (nada de segredo hardcoded) |
| `db.py` | SQL (claim com `FOR UPDATE SKIP LOCKED`, carregar estabelecimento, heartbeat) |
| `extract.py` | Parsing puro — sem rede, 100% testável (telefone, e-mail, DuckDuckGo, Bing, Maps, login wall, forma do resultado) |
| `sources/busca.py` | Busca no DuckDuckGo/Bing |
| `sources/site.py` | Visita o site + páginas de contato |
| `sources/maps.py` | Busca no Google Maps (browser real) |
| `sources/social.py` | Visita perfis públicos de Instagram/Facebook |
| `sources/circuit_breaker.py` | Disjuntor por fonte |
| `sources/rate_limit.py` | Limite de taxa por fonte/domínio |
| `tests/` | Testes pytest + fixtures HTML sintéticas |
| `enricher.service` | Exemplo de unit systemd |
