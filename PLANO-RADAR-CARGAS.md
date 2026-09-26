# Radar de Cargas — avaliação da proposta e plano de execução

**Data:** 25/09/2026 · **Base:** `PROPOSTA-RADAR-LEADS-CARGAS-CRM.md` (Hermes, fora do repo)
**Produto:** só o CRM de Lembretes. Nada do Premium é tocado.

## 1. O que a proposta acerta

- A dor é real e bem descrita: sobra de 400 sacos numa carreta de ~1.200–1.280 sacos já
  contratada. Vender o espaço ocioso na rota tem valor claro.
- O fluxo está certo: busca → **o atendente escolhe** → vira tarefa com link `wa.me`. O
  humano decide e envia.
- A segregação CRM × Premium e o uso do protocolo de coordenação estão corretos.

## 2. O que não funciona como está escrito

| # | Proposta | Realidade | Correção |
|---|---|---|---|
| 1 | IA via OmniRoute em `http://127.0.0.1:8317` | O servidor roda na Vercel. `127.0.0.1` lá é a própria função, não a VPS. A chamada nunca chega. | Endpoint **público HTTPS com chave** na VPS, configurado por variável de ambiente. Opcional: sem ele, a cadeia atual (Groq→…) segue funcionando. |
| 2 | Buscar empresas por CNAE + cidade na BrasilAPI/ReceitaWS | Essas APIs só **consultam um CNPJ que você já tem**. Nenhuma API gratuita lista empresas por CNAE e município. | Importar a **base aberta de CNPJ da Receita** (mensal, gratuita, oficial), filtrada pelos CNAEs e UFs de interesse. A BrasilAPI fica para confirmar o status na hora. |
| 3 | "Inscrição Estadual ativa" no resultado | A IE não está na base da Receita. Consultar exige SINTEGRA de cada estado (captcha) ou API paga. | Fase 1: link para consulta manual. IE por API paga só se o dono quiser pagar (seção 6). |
| 4 | "WhatsApp verificado" | Não existe meio legítimo de verificar se um número tem WhatsApp. | Marcar "provável celular" (9 dígitos começando com 9) e deixar claro que **não** é verificação. |
| 5 | Campos `clientName`, `document`, `stateRegistration`, `whatsapp`, `city`, `state`, `dueDate` | Não existem em `tasks`. | Usar o que existe: `title` = "NOME - CIDADE - UF" (padrão que o filtro de cidade/UF já lê), `description` = "CIDADE - UF", `cnpj`, `phone`, `email`, `tags`, `notes`, `reminderDate`, `assignedTo`. |
| 6 | "Ler `shared/schema.ts`" | Não existe. O schema é `server/db/schema.ts`. | — |
| 7 | Distância rodoviária (OSRM) | O servidor público do OSRM não é para produção, e rodar um exige infra. | **Linha reta** entre centros dos municípios, rotulada assim na tela. |
| 8 | Buscar pelo nome da cidade | Há nomes repetidos entre estados (existe **Barracão** no PR e no RS). | Autocomplete que envia o código IBGE. |
| 9 | Copy com "gatilho de escassez" | Pode, desde que seja **verdade**. | A IA recebe só fatos (saldo, cidade, data e frete digitados pelo atendente). Não inventa preço, desconto, prazo nem fala de saúde (ESTADO seção 4). |
| 10 | Filtragem da IA ("pet shop de banho e tosa") | Com CNAE e nome, a IA adivinha. Não dá para confiar nisso para descartar lead. | Fase 1 sem filtro por IA. A IA escreve o rascunho da mensagem sob demanda, um lead por vez. |
| 11 | CNAE 4789-0/04 como "rações" | A descrição oficial é "animais e alimentos para animais **de estimação**": vai trazer pet shop. | Mantido como segmento separado e desmarcável. **Validar a lista de CNAEs** com a carteira real (Fase 3). |

## 3. Conformidade (não negociável)

- **Envio manual.** A regra do projeto proíbe WhatsApp e e-mail frio automatizados. O
  Radar só gera o link `wa.me` com o texto. Quem clica e envia é o atendente.
- **LGPD.** Dado público de pessoa jurídica pode ser usado com legítimo interesse, mas
  MEI e empresário individual são pessoas físicas. Por isso a base guarda só o necessário,
  registra a origem (`source_release`) e respeita as exclusões que o CRM já tem:
  `task_deletion_logs` (lead excluído, por CNPJ/telefone) e `email_suppressions`.
- **Não usa `suppression_list`/`audit_logs`:** essas tabelas B2B ficam no banco do
  Premium (`ordersDb`). Tocar nelas quebraria a segregação.

## 4. Arquitetura

```
VPS do dono (mensal)                          Vercel (CRM)
┌─────────────────────────────┐              ┌──────────────────────────────────┐
│ scripts/radar/              │   INSERT     │ prospectingRadar.search          │
│   import-receita.ts         │ ───────────► │  municípios no raio (geo.ts)     │
│ baixa Estabelecimentos +    │  radar_      │  → radar_establishments          │
│ Empresas, filtra CNAE/UF/   │  establish-  │  → cruza tasks / exclusões       │
│ ativas, grava no Neon       │  ments       │ verifyCnpj → BrasilAPI (ao vivo) │
└─────────────────────────────┘              │ draftMessage → lib/llm.ts        │
                                             │ convert → INSERT em tasks        │
                                             └──────────────────────────────────┘
```

- **Municípios:** `server/data/municipios.json` (5.571 municípios com coordenadas e
  código SIAFI, que é o código de município da Receita). Fonte: kelvins/municipios-brasileiros, MIT.
- **Tamanho:** o Neon free tier tem 512 MB. O importador mede antes de gravar e recebe a
  lista de UFs. Começar por PR, SC e RS.
- **IA:** provedor opcional `antigravity` (endpoint OpenAI-compatível do dono), primeiro da
  cadeia quando configurado. Sem ele, nada muda.

### Variáveis de ambiente novas (Vercel; nunca no repositório)

| Variável | Para quê |
|---|---|
| `ANTIGRAVITY_BASE_URL` | URL **pública HTTPS** do endpoint OpenAI-compatível na VPS (termina em `/v1`) |
| `ANTIGRAVITY_API_KEY` | Chave desse endpoint |
| `ANTIGRAVITY_MODEL` | Ex.: `gemini-3.8-flash` (o nome que o endpoint aceita) |

O importador roda na VPS com o `DATABASE_URL` do CRM no `.env` de lá.

> **Risco a considerar:** se esse endpoint for um proxy que usa uma conta pessoal do
> Antigravity/Gemini CLI (e não uma chave oficial da API Gemini ou do Vertex), isso pode
> violar os termos do Google e derrubar a conta. A cadeia de fallback segura a operação,
> mas a opção estável é uma chave oficial do Google AI Studio.

## 5. Fases

**Fase 1 (MVP, feita em 25/09)**
1. Contrato: tabela, tipos, geo, esqueleto do router (feito por Claude).
2. Importador da Receita + testes de parsing.
3. Backend: busca, cruzamento com o CRM, confirmação de CNPJ, conversão em tarefa.
4. IA: `lib/llm.ts` (cadeia reutilizável), provedor `antigravity` e rascunho da mensagem.
5. Tela `/radar-cargas`: busca → lista → confirmar CNPJ → rascunho → criar tarefa e abrir `wa.me`.

**Fase 2 (feita em 26/09, a pedido do dono): enriquecimento por scraping**
- Ao Buscar, as 60 empresas mais próximas entram na fila `radar_enrichment`; o robô
  Python/Scrapling da VPS (`scripts/radar/enricher/`) varre buscador → site → Google
  Maps → Instagram/Facebook públicos e os cards se completam na tela. Resultado vale 30 dias.
- Limites: não resolve captcha, não faz login, respeita robots.txt nos sites, pausa a
  fonte bloqueada por 60 min. Raspar o Google Maps vai contra os termos do Google e pode
  bloquear o IP da VPS — o robô vai devagar para reduzir isso.
- WhatsApp achado em link `wa.me` é mostrado como WhatsApp; telefone da Receita continua
  "provável celular".

**Fluxo de contato (26/09, pedido do dono): a busca é só uma lista**
- Nada vira tarefa sem clique. O atendente contata do card (WhatsApp com mensagem
  pronta ou Ligar — envio sempre manual); o contato fica registrado para todos
  ("Contatado por Fulano", em âmbar se foi outro atendente nas últimas 24 h).
- Depois decide: **Transformar em tarefa** (com resultado do contato e data do próximo
  retorno) ou **Descartar** (com motivo).
- **Descartes são permanentes:** histórico append-only em `radar_lead_events`, só
  admin/gerente restaura, descartado não ocupa vaga no limite de 200 nem vai para o
  robô de scraping. "Pediu para não ser contatado" também descadastra o e-mail.

**Fase 3 (depois de usar)**
- **Perfil CNAE da carteira real:** consultar na BrasilAPI os CNPJs das tarefas convertidas
  e contar os CNAEs. É isso que valida (ou corrige) a lista de segmentos, com dado real.
- Ranking por porte e por histórico de compra na cidade.
- Rota da carreta (vários destinos) em vez de uma cidade só.

**Fase 4 (depende de decisão e custo do dono)**
- IE via API paga (CNPJá, que consulta o CCC, ou equivalente) ou SINTEGRA manual.
- Distância rodoviária com OSRM próprio na VPS.

## 6. Decisões que ficam com o dono

1. Rodar o importador na VPS (instruções em `scripts/radar/README.md`) e dizer quais UFs.
2. Configurar as 3 variáveis `ANTIGRAVITY_*` na Vercel, ou não configurar (a cadeia atual continua).
3. Pagar ou não uma API de IE.
4. Validar a lista de CNAEs em `shared/radar.ts`.
