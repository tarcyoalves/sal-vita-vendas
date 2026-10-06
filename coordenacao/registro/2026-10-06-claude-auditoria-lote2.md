# Auditoria do CRM — Lote 2 (dados, pagamentos, atendentes, e-mail)

- **Quem:** Claude (arquiteto) com agentes Sonnet · **Início:** 2026-10-06
- **Arquivos reivindicados (não editar até ir para registro/):**
  - api/index.ts, server/lib/orderConfirmation.ts, server/routers/shipping.ts, server/routers/recovery.ts,
    server/db/migrate.ts (índices NÃO únicos + purge; SCHEMA_VERSION), tests/schema-version.lock.json
  - server/routers/auth.ts, sellers.ts, workSessions.ts, unsubscribe.ts, tasks.ts (confirmEmail/validações),
    prospectingRadar.ts (convert), server/lib/cache.ts
- Sem índice único novo (risco de falhar a migração com duplicatas); Hermes: não tocar nestes arquivos.

## Concluído (Lote 2)
- Pagamentos (Premium): pedido 'failed' pago depois (PIX após cartão recusado) passa a confirmar,
  exceto se o pedido foi cancelado; confirmOrderPaid com try/catch por passo e await nos envios;
  webhook MP responde 500 em erro; reconcile ORDER BY created_at DESC; cron de abandono com claim
  atômico (SKIP LOCKED) e orçamento de 45 s; etiqueta Melhor Envio com reserva; deleteOrder não apaga
  pedido confirmado; cancelOrder só grava 'cancelled' se o reembolso funcionou.
- Banco: índices comuns (tasks created_at/cnpj/phone/client_id, reminders user_id, recipients/enrollments
  task_id, site_orders, abandoned_carts); purges corrigidos (work_sessions 'ended'; chat em fuso SP;
  task_deletion_logs 730 dias). SCHEMA_VERSION 2026-10-06a / orders-2026-10-06a (lock atualizado).
- Atendentes: e-mail sem diferenciar caixa; reset de senha consome token atomicamente; delete com dados
  vinculados desativa; update renomeia tarefas e users num db.batch; último admin não é rebaixado.
- Sessões de trabalho: start idempotente; horas do dia somam todas as sessões; sessão esquecida de dia
  anterior é fechada no último sinal de vida (LIMITAÇÃO: sem heartbeat pode creditar ~0 h).
- E-mail: GET de descadastro só mostra confirmação, POST suprime; falha da supressão principal responde 500;
  desconfirmar e-mail cancela sequências; convert do Radar com INSERT condicional.
- Segredos (ADMIN_RESET_SECRET, CRON_SECRET, Brevo) comparados em tempo constante.
- NÃO feito de propósito: índice ÚNICO em tasks.cnpj/work_sessions (duplicatas em produção podem derrubar a
  migração); tokenVersion no JWT (SEC-10, exige coluna); sanitização HTML do broadcast (SEC-7).
- Testes: 482. Gates: check, vitest, build:client, build:api.
