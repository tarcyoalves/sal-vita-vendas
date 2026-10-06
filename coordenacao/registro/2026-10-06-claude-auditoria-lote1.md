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

## Concluído (Lote 1)
- c33fbd5: segurança — lote tRPC não contorna mais os limitadores; atendente inativo e
  mustChangePassword valem no servidor; ferramentas de IA só as oferecidas ao papel;
  tv.dashboard só staff; enroll/engagement respeitam dono; webhook Resend do CRM alcançável.
- Faturamento: atendente não se aprova nem escolhe comissão; save com cache velho não
  desfaz espelho do SMBI (mergeProtegidoPeloEspelho; Faturar/Desfazer continuam via `acao`);
  edição de pedido mantém comissão congelada; prévia usa comissaoPedido; parseBRL com milhar;
  validações min/max; atendente não remove pedido faturado/ligado ao SMBI.
- Tarefas: contato só conta se a nota mudou; excluir lead cancela sequências; ids em lote <= 500;
  busca adiada; lembrete nativo reagenda e usa service worker; salvar sem clique duplo.
- Mobile: DialogContent com max-h/overflow; modais de senha do AppShell; h-dvh.
- Efeito para o Hermes: a tela não sobrescreve mais status/itens/comissão/frete de pedido já
  espelhado pelo SMBI; só ações `faturar`/`desfazer` explícitas.
- Testes: 452 (+23 em tests/faturamento-protecao.test.ts, +sec-guards, +resend). Gates ok.
