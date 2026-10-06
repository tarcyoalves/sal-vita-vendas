# Auditoria do CRM — Lote 3 (UX/mobile + negócio/segurança restantes)

- **Quem:** Claude (arquiteto) com agentes Sonnet · **Início:** 2026-10-06
- **Frontend (3A):** client/src/main.tsx, index.css, pages/{Home,Tasks,ClientsManagement,AdminDashboard,Attendants,
  AttendantProgress,AiChat,KnowledgeBase,Documentos}.tsx, components/{ActiveTimer,AppShell}.tsx,
  components/faturamento/*, lib/faturamento/store.ts, hooks/useReminderNotifications.ts
- **Backend (3B):** server/routers/{emailMarketing,ai,shipping,faturamento,tasks}.ts, server/lib/smbiFaturamento.ts,
  server/lib/email/*, server/email/*, shared/*
- Sem migração/índice único novo. Hermes: não tocar nestes arquivos.

## Concluído (Lote 3)
- Frontend/mobile: erros de carga viram banner 'Tentar de novo' (antes pareciam 'sem dados'); store de
  faturamento recarrega (mount >10 s, foco >2 min) e descarta resposta velha durante escrita; toast de
  aprovação só após o servidor; refetch ao reconectar e ao voltar o foco (tasks/sessões >5 min);
  inputs 16px no celular (index.css); grids 1 coluna; aria-label + alvo 40px; AdminDashboard com useMemo e
  dono da tarefa normalizado; ConfirmDialog no lugar de confirm() (3 telas); AiChat restaura o texto em falha;
  notificações pedem permissão por clique.
- Backend: HTML de e-mail — EQUIPE mantém documento/<style> e perde só script/iframe/form/on*/javascript:;
  ATENDENTE passa por allowlist estrita (sanitize-html) + só leads próprios confirmados + 200/dia + extensões
  de anexo; erros de IA/MP sem detalhe; mesmo erro para pedido inexistente e negado; alerta de desconto do
  SMBI só com componentes comparáveis; atribuição validada contra o cadastro; bulkCreate ignora duplicados
  (retorno agora {created,length,duplicadas}); campanhas repetem 429/5xx uma vez e não reabrem 'sent';
  IA com fuso de São Paulo e validação de argumentos.
- Ajuste do arquiteto: o sanitizador da equipe NÃO remove <style> (regressão de templates evitada).
- Testes: 535. Gates: check, vitest, build:client, build:api.
