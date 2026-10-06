# Auditoria do CRM — Lote 3 (UX/mobile + negócio/segurança restantes)

- **Quem:** Claude (arquiteto) com agentes Sonnet · **Início:** 2026-10-06
- **Frontend (3A):** client/src/main.tsx, index.css, pages/{Home,Tasks,ClientsManagement,AdminDashboard,Attendants,
  AttendantProgress,AiChat,KnowledgeBase,Documentos}.tsx, components/{ActiveTimer,AppShell}.tsx,
  components/faturamento/*, lib/faturamento/store.ts, hooks/useReminderNotifications.ts
- **Backend (3B):** server/routers/{emailMarketing,ai,shipping,faturamento,tasks}.ts, server/lib/smbiFaturamento.ts,
  server/lib/email/*, server/email/*, shared/*
- Sem migração/índice único novo. Hermes: não tocar nestes arquivos.
