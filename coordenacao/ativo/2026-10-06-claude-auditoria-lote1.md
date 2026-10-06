# Auditoria do CRM — Lote 1 (segurança + integridade)

- **Quem:** Claude (arquiteto) com agentes Sonnet executores · **Início:** 2026-10-06
- **Arquivos reivindicados (não editar até ser movido para registro/):**
  - api/index.ts (limitadores tRPC em lote, webhook Resend duplicado)
  - server/trpc.ts, server/routers/auth.ts (atendente inativo, mustChangePassword no servidor)
  - server/routers/tv.ts, server/routers/ai.ts (allowlist de ferramentas por papel)
  - server/routers/emailMarketing.ts (só enrollTasksInSequence/engagementByTaskIds/enrollmentsByTaskIds: filtro de dono)
  - server/routers/faturamento.ts, client/src/components/faturamento/OrderDialog.tsx,
    client/src/lib/faturamento/* (pedido novo não nasce aprovado; save com cache velho não desfaz espelho SMBI; comissão congelada)
  - server/routers/tasks.ts (contato só se a nota mudar; excluir lead cancela sequências)
  - client/src/pages/Tasks.tsx (ids em lote <= 500; clique duplo; lembrete nativo)
  - client/src/components/ui/dialog.tsx, client/src/components/AppShell.tsx (rolagem de diálogos no celular)
- Regras do SMBI/faturamento (CRM é espelho) preservadas; Hermes: não tocar nestes arquivos até o registro.
