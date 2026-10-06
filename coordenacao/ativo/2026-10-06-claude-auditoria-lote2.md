# Auditoria do CRM — Lote 2 (dados, pagamentos, atendentes, e-mail)

- **Quem:** Claude (arquiteto) com agentes Sonnet · **Início:** 2026-10-06
- **Arquivos reivindicados (não editar até ir para registro/):**
  - api/index.ts, server/lib/orderConfirmation.ts, server/routers/shipping.ts, server/routers/recovery.ts,
    server/db/migrate.ts (índices NÃO únicos + purge; SCHEMA_VERSION), tests/schema-version.lock.json
  - server/routers/auth.ts, sellers.ts, workSessions.ts, unsubscribe.ts, tasks.ts (confirmEmail/validações),
    prospectingRadar.ts (convert), server/lib/cache.ts
- Sem índice único novo (risco de falhar a migração com duplicatas); Hermes: não tocar nestes arquivos.
