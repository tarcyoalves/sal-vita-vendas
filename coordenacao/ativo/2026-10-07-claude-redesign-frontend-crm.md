# Auditoria e redesign do frontend do CRM

- **Agente:** claude
- **Início:** 2026-10-07 09:30 BRT
- **Fim:**
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Pedido do dono: auditoria completa do frontend do CRM Lembretes para tirar a cara de
template/IA e criar uma linguagem visual única (tipografia, cores, espaçamento,
botões, tabelas, modais, estados, mobile, acessibilidade). Só camada visual e de
interação: **nenhuma regra de negócio, procedure, query ou schema muda.**

## Arquivos e áreas que vou tocar

- `client/src/index.css`, `tailwind.config.js`
- `client/src/components/ui/*` (primitivos shadcn)
- `client/src/components/AppShell.tsx`, `ActiveTimer.tsx`, `FloatingChat.tsx`,
  `AttendantDetailModal.tsx`, `ConfirmDialog.tsx`, `PromptDialog.tsx`, `QueryError.tsx`
- `client/src/components/{tasks,radar,faturamento,email}/` — só JSX/classes
- Páginas do CRM em `client/src/pages/`: Home, AdminDashboard, AiAnalysis,
  ClientsManagement, Tasks, Attendants, RadarCargas, KnowledgeBase, Documentos,
  AiChat, AiSettings, AttendantProgress, EmailMarketing, Faturamento, NotFound
- `docs/DESIGN-SYSTEM.md` (novo)

**Não vou tocar em:** `server/`, `shared/`, `api/`, schema/migrações, e nas telas do
Premium (`SalVita*`, `Atacado`, `TrackOrder`, `Orders`, `B2bLeads`, `TvDashboard`).
Lógica dentro dos componentes (handlers, queries, mutations, cálculos) fica como está.

## Progresso

- [ ] Inventário e auditoria por página
- [ ] Tokens e primitivos
- [ ] AppShell (sidebar, topo, navegação mobile)
- [ ] Páginas
- [ ] check + test + build; render em 1280px e 390px
- [ ] Segunda auditoria
