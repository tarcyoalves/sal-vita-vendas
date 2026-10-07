# Auditoria completa da loja Premium (storefront)

- **Agente:** claude (Opus coordenando + 9 agentes Sonnet: 4 auditorias, 4 lotes de correção, 1 revisão independente)
- **Início:** 2026-10-07 BRT
- **Fim:** 2026-10-07 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Pedido do dono: auditoria completa da loja `premium.salvitarn.com.br` e correção do que
fosse encontrado (P0→P3). O redesign de 07/10 tinha coberto só o CRM. Também conferir um
relatório do Gemini que descrevia mudanças inexistentes (HANDOFF §7 caso Q).

## Arquivos e áreas tocadas

`client/src/pages/SalVitaLanding.tsx`, `TrackOrder.tsx`, `Atacado.tsx`,
`components/SalVitaChat.tsx`, `client/src/App.tsx`, `vite.config.ts`, `client/index.html`,
`client/public/{robots.txt,robots-crm.txt,sitemap.xml}`, `vercel.json`, `api/index.ts`
(trechos do Premium), `server/routers/{shipping,recovery}.ts`,
`server/lib/{paymentTransition,orderConfirmation,mercadopago}.ts`, `tests/premium-*.test.ts`,
`tests/order-payment-fixes.test.ts`, `ESTADO-DO-PROJETO.md`, `HANDOFF-HERMES.md`.
**Removido:** `client/src/pages/SalVitaLandingClassic.tsx` (rota `/classic` já sem uso).
**Não tocado:** telas e routers do CRM, schema, migrações.

## Resultado

- **Honestidade (CDC art. 37):** saíram a notificação falsa "X de Cidade comprou agora"
  (`Math.random`), "+120 clientes / 5.0 ★", depoimentos sem origem (dois com alegação
  falsa), "Estoque limitado", "Mais Vendido", cronômetro de pressão, preço riscado
  inexistente, "registrado MAPA", "devolvemos sem perguntas", prazos de envio inventados.
- **Conformidade sanitária:** sem contagem/lista de minerais, sem "nada além do sal",
  "não empedra", "pureza", especificações inventadas; linha de ingredientes visível;
  nome da embalagem ("Sal Marinho Não Refinado"). O chat e a IA de recuperação por
  WhatsApp diziam "84+ minerais" e "culinária saudável" a clientes reais — reescritos.
- **Pagamentos:** o polling do PIX nunca funcionou (POST em query → 405 engolido); segundo
  pagamento e pagamento em pedido cancelado eram ignorados em silêncio (agora `[REVISAR]`
  em `site_orders.notes`); pedido cancelado pelo admin podia ser confirmado por PIX tardio;
  `pending` tardio trocava o id do pagamento; chave de idempotência instável no PIX;
  timeouts; pedido duplicado por reenvio (idempotente só se TODOS os campos forem iguais);
  quantidade fora do múltiplo do pacote; mínimo do cupom; limitadores separados.
- **Privacidade:** o token do pedido ia para o Meta Pixel na URL de `/meu-pedido`.
- **Checkout:** beco sem saída sem CEP, dados salvos apagados, pedido pendente sem caminho
  de volta, chat roubando o clique do CTA no celular, alert(), valores "R$ 74.90", cupom de
  link perdido ao escolher o pacote, poll do PIX acima do rate limit.
- **Performance:** a loja baixava o CRM inteiro: 575,8 kB → 184,8 kB gzip (−68%); SW só
  pré-cacheia a loja; assets imutáveis por 1 ano.
- **SEO:** robots/sitemap, rotas estáticas antes do catch-all da loja, noindex em páginas
  internas, canonical próprio do /atacado, Organization com CNPJ.
- **"Cara de IA":** sem partículas, órbita, brilhos, CTAs pulsando, marquee; identidade
  (azul-marinho/dourado, Cormorant, fotos reais) mantida.

## Commits

- `b1c2042` — perf(premium): split the bundle so the store stops downloading the CRM
- `7abe116` — fix(premium): stop leaking the order token to Meta; SEO, caching and a11y
- `292941c` — fix(premium): payments that were lost or ignored, duplicate orders, AI prompts
- `8cf1032` — fix(premium): remove fabricated social proof and unverified claims; checkout
- `c574863` — fix(premium): restore payment options the code proves; delete /classic
- `6e90f56` — fix(premium): cancelled orders can't be confirmed by a late PIX; PIX poll

## Verificado

- `npm run check` — 0 erros (antes de cada commit, num worktree isolado)
- `npm test` — 651 testes, 50 arquivos (linha de base: 599/46)
- `npm run build:client` e `build:api` — ok
- Playwright 320/375/390/1280 px com API simulada: sem overflow horizontal, checkout
  completo incluindo sem-CEP, PIX com falha/429/pago, retomada de pedido cancelado/pago,
  cupom por link; `/meu-pedido` sem token na URL e sem requisição ao Meta com o token.
- Deploys na Vercel: `b1c2042`…`c574863` READY em produção.

## Não verificado / pendente

- Compra real em produção (cria pedido real). Recomendado: um pedido de teste do dono
  com PIX, conferindo que a tela confirma sozinha.
- Rotas do `vercel.json` (robots/sitemap/assets no host da loja) só testadas localmente.
- Itens para o dono e pendências de código: `ESTADO-DO-PROJETO.md` §6 (itens 0 e 11a).

## Armadilhas encontradas

- `shipping.pixStatus` era `query` chamado com POST: o `try/catch` vazio do cliente
  escondeu por meses que o poll nunca funcionava. Teste de contrato cliente×servidor
  (método) evitaria — há uma trava em `tests/premium-payment-rules.test.ts`.
- Cancelar no painel deixa `paymentStatus='awaiting'`: toda regra de "pode confirmar"
  precisa olhar `status`, não só `paymentStatus`.
- Ao remover alegação sem fonte, confira se o código a prova (parcelamento/boleto).
- Relatório de outra IA é hipótese até o `grep` confirmar (HANDOFF §7 caso Q).
