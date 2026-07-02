# Relatório de Auditoria — Sal Vita Premium (e-commerce)

> **Para o agente executor (Sonnet):** este relatório cobre EXCLUSIVAMENTE o subsistema de e-commerce premium (`premium.salvitarn.com.br`). **NUNCA modifique** os routers do CRM de lembretes (`tasks`, `sellers`, `clients`, `reminders`, `ai`, `knowledge`, `workSessions`, `tv`) nem as páginas do CRM. Infra: Vercel free, Neon free (driver `neon-http` — **não suporta transações multi-statement**), e-mails via conta free. Commits em inglês, direto na `main` (deploy automático). Execute na ordem: Críticos → Altos → Médios → Baixos. Após cada grupo, rode `npx tsc --noEmit` e o build antes de push.

Arquivos em escopo: `api/index.ts`, `server/routers/shipping.ts`, `server/routers/recovery.ts`, `server/db/ordersDb.ts`, `server/db/ordersMigrate.ts`, `server/db/schema.ts` (tabelas site_orders, abandoned_carts, automation_runs, coupons, msg_templates), `vercel.json`, `client/src/pages/SalVita*.tsx`, `TrackOrder.tsx`.

---

## 🔴 CRÍTICOS

### C1. Cron de abandoned-cart não está agendado
- **Onde:** `vercel.json` — bloco `crons` só tem `/api/cron/email-daily` (11:00).
- **Problema:** o endpoint `/api/cron/abandoned-cart` concentra: envio de WhatsApp de recuperação, follow-ups de não pagos, lembretes de recompra e **`reconcileAwaitingOrders`** (reconciliação de webhooks MP perdidos). Sem entrada no `crons`, nada disso roda — pedidos pagos cujo webhook falhou nunca confirmam.
- **Correção:** adicionar `{ "path": "/api/cron/abandoned-cart", "schedule": "0 11-23 * * *" }` (plano Hobby permite crons diários/horários limitados — verificar limite do plano; se só 1 cron for permitido, fazer o email-daily chamar internamente a rotina do abandoned-cart).

### C2. `reconcileAwaitingOrders` confirma pagamento sem validar o valor
- **Onde:** `api/index.ts:733-778`.
- **Problema:** o webhook valida `transaction_amount` vs `totalPrice` (`api/index.ts:313-320`), mas o reconcile confirma qualquer payment `approved` sem essa checagem — anula a proteção anti-fraude. Pior: quando o webhook detecta mismatch, retorna `ok:true` sem alterar o pedido, que fica `awaiting` e é confirmado depois pelo reconcile.
- **Correção:** replicar no reconcile a mesma validação `Math.abs(payment.transaction_amount - parseFloat(order.totalPrice ?? '0')) <= 0.01` antes de confirmar.

### C3. Race de confirmação dupla webhook × reconcile
- **Onde:** `api/index.ts:322-329` (webhook) vs `767-772` (reconcile).
- **Problema:** entre o SELECT do reconcile e seu UPDATE, o webhook pode confirmar o mesmo pedido; ambos chamam `confirmOrderPaid(order)` → WhatsApp, e-mail, CAPI e bump de cupom **em dobro**.
- **Correção:** confirmar via update condicional atômico:
  ```ts
  const updated = await db.update(siteOrders)
    .set({ paymentStatus:'confirmed', mpPaymentId, updatedAt:new Date() })
    .where(and(eq(siteOrders.id, orderId), eq(siteOrders.paymentStatus, 'awaiting')))
    .returning();
  if (updated.length) await confirmOrderPaid(updated[0]); // só quem realmente mudou a linha dispara efeitos
  ```
  Aplicar o mesmo padrão nos dois caminhos.

---

## 🟠 ALTOS

### A1. IDOR em `trackOrder` — enumeração de PII de clientes
- **Onde:** `server/routers/shipping.ts:361-391`.
- **Problema:** posse verificada só pelos **4 últimos dígitos do telefone** + IDs sequenciais (`SERIAL` iniciando ~10000). Um atacante itera `orderId` × 10.000 sufixos e extrai nome, cidade, valor e status de qualquer pedido.
- **Correção:** exigir o telefone completo (11 dígitos) OU gerar um token opaco por pedido (ex.: `crypto.randomBytes(8).toString('hex')` numa coluna `track_token`) usado no link `/meu-pedido?pedido=ID&t=TOKEN`. Atualizar `TrackOrder.tsx` e os templates de mensagem que montam o link.

### A2. `createPayment` / `createPixPayment` / `pixStatus` sem verificação de posse obrigatória
- **Onde:** `shipping.ts:425-443` (phone `optional` — sem phone, sem verificação), `491-499` e `545-563` (nenhuma verificação).
- **Correção:** tornar a verificação obrigatória nos três (mesmo mecanismo do A1). A landing (`SalVitaLanding.tsx`) já tem `checkoutForm.customerPhone` disponível para enviar junto — incluir `phone` nos três fetches do frontend ao ajustar o backend.

### A3. Produto e preço unitário não são persistidos no pedido
- **Onde:** `shipping.ts:157-161` (createOrder tem catálogo 29.90/74.90/149.90 mas não grava `product`/`unitPrice`); defaults do schema (`schema.ts:163-164`) assumem "Sal Marinho Integral 1kg"/29.90.
- **Consequências:** `createPayment` usa título genérico (`shipping.ts:448`); `generateLabel` hardcoda `unitary_value: 29.90` e nome 1kg (`shipping.ts:630-633`) mesmo para Trio 3kg/Caixa; `insurance_value` cai em fallback `'30'`.
- **Correção:** em `createOrder`, gravar `product: catalogItem.name` e `unitPrice: String(catalogItem.price)`; em `generateLabel`/`createPayment`, derivar desses campos persistidos.

---

## 🟡 MÉDIOS

### M1. Race no `usedCount` de cupom
- Checagem `usedCount < maxUses` acontece em `createOrder` (`shipping.ts:178-197`), mas o incremento só na confirmação (`bumpCouponUsage`) — N pedidos pendentes passam e todos confirmam, estourando `maxUses`.
- **Correção:** incremento atômico condicional: `UPDATE coupons SET used_count = used_count + 1 WHERE id = ? AND used_count < max_uses` e tratar 0 linhas afetadas (não aplicar desconto/logar aviso).

### M2. PIX cria pagamento novo a cada clique
- **Onde:** `shipping.ts:522` — `X-Idempotency-Key: pix-${order.id}-${Date.now()}`; e `fetchPixCode` (`api/index.ts:648-651`, `recovery.ts:153-156`) também cria PIX quando não encontra.
- **Risco:** cliente paga QR antigo, ou paga PIX **e** cartão — a segunda confirmação é ignorada e não há reembolso automático.
- **Correção:** chave estável `pix-${order.id}`; antes de criar, buscar pagamento PIX pendente existente do pedido (persistir `mpPaymentId` do PIX pendente numa coluna ou consultar `/v1/payments/search?external_reference=`).

### M3. `createOrder` não cancela carrinho abandonado
- Ao criar pedido, o `abandoned_cart` do mesmo telefone não é marcado `converted` nem os `automation_runs` agendados são cancelados — cliente que já comprou continua recebendo WhatsApp de "finalize seu carrinho" enquanto o pedido está `awaiting`.
- **Correção:** no fim de `createOrder`, atualizar cart (status `converted`) e cancelar runs `scheduled` por `customerPhone` (mesmo código já existente no webhook, `api/index.ts` região 322-345 — extrair helper).

### M4. Webhook MP processa notificações sem HMAC
- **Onde:** `api/index.ts:269-285` — headers `x-signature` ausentes ⇒ processa sem validação (decisão de maio/2026 para não travar IPN). Com o webhook do painel MP já configurado e funcionando, endurecer: exigir assinatura válida quando `MERCADO_PAGO_WEBHOOK_SECRET` estiver setado, logando e rejeitando 401 sem headers. Validar em produção observando os logs por alguns dias antes.

### M5. `/api/orders-health` e `/api/db-health` sem autenticação
- **Onde:** `api/index.ts:993-1014` e `:112`. O primeiro executa `ensureOrdersTablesExist()` (DDL) a cada chamada anônima.
- **Correção:** exigir `x-cron-secret`/`CRON_SECRET` ou remover; no mínimo, tirar o DDL do handler.

### M6. Mismatch de valor deixa pedido preso
- **Onde:** `api/index.ts:315-319` — retorna ok sem marcar nada; reconcile reprocessa para sempre.
- **Correção:** setar `paymentStatus: 'needs_review'` (adicionar ao enum aceito no admin) e exibir badge no `SalVitaAdmin.tsx`.

### M7. Fetches externos sem timeout/retry + lotes desalinhados
- Chamadas MP/Melhor Envio sem `AbortController` (só WhatsApp tem timeout). `maxDuration` é 60s mas lotes usam `LIMIT 2/3/5` com sleep de 1s (comentários citam "Hobby 10s budget" defasado) — backlog nunca drena.
- **Correção:** helper `fetchWithTimeout(url, opts, ms=10000)` com AbortController para todas as chamadas externas; subir lotes para ~15-20 itens mantendo o sleep.

### M8. Sem transações — usar updates condicionais idempotentes
- O driver `neon-http` (`ordersDb.ts`) não suporta `db.transaction`. Não tentar migrar driver; padronizar caminhos críticos (confirmação, cupom, cancelamento) com `UPDATE ... WHERE <estado esperado> RETURNING` (mesmo padrão do C3/M1).

### M9. CSP com `'unsafe-inline'` em scriptSrc + políticas divergentes
- **Onde:** `api/index.ts:87` (Helmet) e `vercel.json` headers — duas CSPs diferentes, ambas com `script-src 'unsafe-inline'`.
- **Correção:** unificar numa só (preferir a do `vercel.json` e desligar a CSP do Helmet nas rotas de API, ou vice-versa). Remover `unsafe-inline` de `script-src` exigirá mover o snippet do pixel para arquivo próprio — avaliar custo/benefício; no mínimo unificar as políticas.

---

## 🔵 BAIXOS

1. **Segredo do webhook Brevo via query string** (`api/index.ts:449`) — aceitar só via header (query vaza em logs).
2. **Parse manual do envelope tRPC** na landing/TrackOrder (`data?.result?.data?.json?...`) — migrar para hooks `trpc.*.useMutation/useQuery` (o client já existe em `client/src/lib/trpc.ts` e é usado no admin). Nota: `shipping.pixStatus` é `.query` mas é chamado com POST — funciona com o adapter atual, mas é frágil.
3. **`window.confirm`/`alert` no admin** (`SalVitaAdmin.tsx:307,313`, `SalVitaRecovery.tsx:364,666,860`) — trocar por modal/toast consistente.
4. **`trackCart` engole erros** silenciosamente (`.catch(()=>{})`) — adicionar `console.warn` no mínimo.
5. **Fallbacks de preço espalhados** (`'30'`, `'29.90'`, `'0'`) — após A3, centralizar num helper `orderTotal(order)`.
6. **`isBusinessHours` com offset UTC-3 fixo** (`api/index.ts:26`, `recovery.ts:65`) — correto hoje; documentar o pressuposto em comentário.

---

## Ordem de execução sugerida

| Fase | Itens | Risco | Observação |
|------|-------|-------|------------|
| 1 | C1, C2, C3 | Baixo (backend isolado) | Deploy e observar logs do cron |
| 2 | A3, M3, M6 | Baixo | Dados novos ficam corretos; antigos mantêm defaults |
| 3 | A1, A2 | **Médio** — muda contrato frontend↔backend | Alterar backend + landing + TrackOrder + links de template no mesmo commit |
| 4 | M1, M2, M7, M8 | Baixo | |
| 5 | M4, M5, M9 + baixos | Baixo | M4 só após confirmar assinatura chegando nos logs |

## Verificação após cada fase
1. `npx tsc --noEmit` e `node node_modules/vite/bin/vite.js build client -c vite.config.ts`.
2. Fluxo manual em produção: criar pedido de teste em `premium.salvitarn.com.br` → gerar PIX → conferir status no `/sal-vita-admin`.
3. Conferir logs da função no painel Vercel (webhook + cron).

> Gerado em 02/07/2026 por auditoria automatizada (2 agentes de exploração, escopo premium). A landing page foi redesenhada nesta mesma data — versão anterior preservada em `SalVitaLandingClassic.tsx` (rota `/classic`).
