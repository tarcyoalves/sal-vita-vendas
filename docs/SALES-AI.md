# Sal Vita Sales AI — mapa técnico

Venda B2B da caixa de 10 kg do Sal Vita Premium: o Radar acha empresas, o ciclo monta um lote
diário, o Hermes envia por uma caixa de e-mail própria, o vendedor virtual atende no `/atacado` e o
painel "Vendas B2B" concentra decisões e exceções. Produto: loja **Premium** (banco `ORDERS_DATABASE_URL`).

> **Tudo nasce desligado.** Modo `DRY_RUN`, canal de prospecção desligado e sem política aprovada,
> vendedor virtual desligado, simulador de revenda desligado, modelo de e-mail em rascunho.
> Nenhum e-mail comercial sai até o dono ligar cada uma dessas chaves no painel.

## Regras que não podem ser relaxadas

1. **Resend e Brevo nunca para prospecção.** As políticas dos dois proíbem contato frio (Resend:
   "unsolicited messages of any kind, including cold outreach"; Brevo: listas raspadas "strictly
   prohibited" e prova de opt-in). A prospecção sai só pela caixa SMTP operada pelo executor do Hermes.
   Há teste que reprova import de `sendEmail`/`sendBatch` em `server/lib/sales/`.
2. **Nada sai sem autorização de despacho** curta, com número de ordem (fence), revalidando modo,
   canal, aprovação, supressão nos DOIS bancos, jornada, limites e elegibilidade. Falha de consulta nega.
3. **`UNKNOWN` nunca é reenviado sozinho.** Vai para "Precisa de você"; o dono decide se foi ou não.
4. **Clique não é autorização** nem prova de interesse. Só sobe prioridade.
5. **Supressão prevalece.** Descadastro, reclamação, devolução ou "sair" suprime em todas as listas
   (`suppressEmailGlobal`). Reclamação de spam no piloto pausa tudo.
6. **Conteúdo:** nada de saúde, minerais, "sem aditivos", "100% natural" (ESTADO-DO-PROJETO.md §4).
   `server/lib/sales/conteudo.ts` barra o texto; o vendedor virtual tem mais 8 camadas.
7. **Preço, frete e prazo mostrados ao cliente são montados pelo servidor**, nunca escritos pelo modelo.

## Onde está cada parte

| Parte | Arquivos |
|---|---|
| Contrato compartilhado (modos, estados, configurações, corpo das rotas) | `shared/sales.ts` |
| Tabelas `sales_*` | `server/db/schema.ts` (fim), `server/db/salesMigrate.ts` (versão própria, `SALES_SCHEMA_VERSION`) |
| Regras puras | `server/lib/sales/{estados,elegibilidade,arbitro,despacho,conteudo,mensagem,pontuacao,descadastro}.ts` |
| Ciclo diário, ponte Radar → prospecção, saída para tarefas do CRM | `server/lib/sales/{ciclo,ponte,consultas,acoes,operacoes,relatorioDb}.ts` |
| Rotas do Hermes (`/api/sales/*`) | `server/salesRoutes.ts`, `server/lib/sales/hermes.ts`; contrato em `docs/CONTRATO-HERMES-VENDAS.md` |
| Vendedor virtual | `server/routers/salesAgent.ts`, `server/lib/sales/agente/*`, `client/src/components/sales/SalesAgentWidget.tsx` |
| Página `/atacado` | `client/src/pages/Atacado.tsx`, `client/src/components/sales/*`, `server/routers/salesPublic.ts`, `shared/salesSimulador.ts`, `shared/salesOferta.ts` |
| Painel "Vendas B2B" (`/sal-vita-vendas`) | `server/routers/sales.ts`, `server/routers/salesRegras.ts`, `client/src/pages/admin/sales/*` |
| Radar, perfil Premium | `shared/radarPremium.ts`, `server/lib/radar/{premiumImport,premiumCandidatos,cargoScope}.ts`, `scripts/radar/README.md` |
| Lado do Hermes (VPS) | `scripts/sales/` (executor Python só com biblioteca padrão, auditoria só leitura), `docs/HERMES-SKILLS-VENDAS.md` |

## Variáveis

Só nomes. Valores na Vercel e no arquivo de ambiente da VPS (`/etc/sales-executor.env`, modo 600).

| Variável | Onde | Para quê |
|---|---|---|
| `SALES_HERMES_SECRET_READ` | Vercel e VPS | Escopo leitura (`/modo`, `/relatorio`, `/heartbeat`) |
| `SALES_HERMES_SECRET_PROPOSE` | Vercel e VPS | Escopo propostas |
| `SALES_HERMES_SECRET_OPERATE` | Vercel e VPS | Escopo operação (`/ciclo`) |
| `SALES_HERMES_SECRET_DISPATCH` | Vercel e VPS | Escopo despacho (reserva, autorização, resultado, eventos da caixa) |
| SMTP/IMAP da caixa de prospecção | **só VPS** | O modelo de IA nunca vê essas credenciais |

Variável ausente na Vercel = a rota daquele escopo responde 503 (fechada).

## Antes do primeiro envio real (ordem)

1. Radar com o perfil Premium importado e enriquecido (`scripts/radar/README.md`).
2. Caixa de e-mail própria com SPF, DKIM e DMARC; termos do provedor lidos; registro no painel
   (provedor, link, data, responsável, conclusão) e `politicaAprovada`.
3. Remetente completo (nome, razão social, CNPJ, endereço, site, link do Mercado Livre) e domínio do canal.
4. Modelo de e-mail aprovado no painel (a trava de conteúdo roda na aprovação).
5. Atendente do CRM definido (tarefas de resposta).
6. Executor na VPS em `DRY_RUN`, depois o modo `REVIEW` com aprovação diária do lote.

## Proteções de uso (revisão de 28/11/2026)

- Executor: ciclo de no mínimo 5 min e só dentro da janela (`SALES_JANELA`, padrão 08:00–18:00 de
  Fortaleza). Fora dela não chama a API. `GET /modo` responde de um cache de 30 s e só acorda o banco da loja.
- Vendedor virtual: não entra em lote tRPC; tetos atômicos por conversa, por visitante (24 h) e por dia,
  contados ANTES de chamar a IA. Mais de 10 caixas vai sempre para uma pessoa.
- Opt-out, reclamação e devolução suprimem o endereço mesmo sem jornada; reclamação pausa tudo.
- Recusa de uma mensagem só (intervalo, teto da empresa) = 409, o executor pula; recusa global = 423, para o ciclo.
- Mudar para DRY_RUN/PAUSED ou fechar o canal revoga as reservas; a autorização final relê o modo e o canal
  no mesmo comando.
- Migração das tabelas de vendas tem preguiça própria: falha nela não atrasa a loja.

## Limites conhecidos

- O frete do Mercado Livre não é consultado; nenhuma tela declara canal mais barato.
- A loja não tem estoque: a disponibilidade é um indicador manual no painel.
- Linha de abertura por IA no e-mail: não implementada (sempre vazia).
- Margem e lucro: não calculáveis sem o custo industrial (decisão do dono).
- Tetos diários podem ser excedidos em até (nº de executores − 1) com vários executores simultâneos.
