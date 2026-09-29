# SMBI: vínculo com o ERP nunca pode ser apagado pela tela + feedback do botão

- **Agente:** claude
- **Início:** 2026-09-29 BRT
- **Fim:** 2026-09-29 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

1. Achado nº 1 da auditoria do Hermes (e confirmado no código): `upsertPedido` deixa o payload
   de um ADMIN sobrescrever `smbiMovsaiId`/`numeroNfe`/`numeroCte`. Com o espelho desatualizado
   a tela manda `null`, o pedido volta à fila do robô e é duplicado no ERP. Esses três campos
   passam a ser gravados SÓ pela API do robô. `comissaoComercialProtegida` não é zerada por
   payload nulo.
2. O botão "Enviar pedido para SMBI" não mostra o que acontece depois: exibir "Solicitado em ...
   aguardando o robô" e explicar no toast.

## Arquivos e áreas que vou tocar

- `server/lib/smbi.ts` (função pura nova), `server/routers/faturamento.ts` (só `upsertPedido`)
- `client/src/components/faturamento/OrderDetailDialog.tsx` (só o bloco do botão SMBI)
- `tests/smbi-owned-fields.test.ts` (novo)

**Não vou tocar em:** migrações, schema, rota `/api/smbi/*`, robô, demais achados da auditoria.

## Progresso

- [x] Correção + testes (`resolveRobotOwnedFields`, 5 testes)
- [x] Feedback na tela ("Solicitado em ... aguardando o robô" + toast explicativo)
- [x] Deploy — **083ed60 FALHOU no build da Vercel** (workbox: bundle do cliente passou de 2 MiB); corrigido em d8f80fd (limite do precache em vite.config.ts). Deploy de d8f80fd ficou READY (build: check, 224 testes e migrate:build ok; sem erro de runtime; `/api/smbi/pedidos` sem senha responde 401). Ainda não verificado: a tela do pedido aberta no navegador.

---

## Resultado

A tela nunca mais apaga o vínculo com o SMBI, nem quando o admin edita com o espelho
desatualizado. O botão passa a mostrar que o pedido foi solicitado e que o robô responde.

## Verificado

- `npm run check` 0 erros; `npx vitest run --dir tests` 224 passando.
- Diagnóstico em produção: `POST faturamento.dispararSmbi` 200 às 11:39; **nenhuma consulta do
  robô a `/api/smbi/pedidos` nas últimas 14 h** (a última foi na noite de 28/09).

## Não verificado / pendente

- **Lição:** `npm run check` + `npm test` não pegam falha de `vite build`. Rode também `npm run build:client && npm run build:api` antes de dar como pronto e confira o deploy na Vercel.

- Interface aberta no navegador (só typecheck).
- Robô fora do ar: precisa ser religado pelo Hermes/agente da VPS.
- Pedidos 1108–1113 criados por engano no SMBI: já cancelados pelo dono (informado em 29/09/2026).
- Demais achados da auditoria do Hermes (auto-aprovação por atendente, webhook Resend, cron de
  campanhas não atômico, `emergencyReset`, IP vazio, `workSessions.start`, limpeza de
  `work_sessions`): ainda abertos.
