# CRM lote 3 (telas do atendente)

- **Agente:** claude
- **Início:** 2026-11-23
- **Fim:** 2026-11-23
- **Status:** parcial (commits locais na branch `crm-lote3`, sem push; falta merge em main e deploy)
- **Branch:** `crm-lote3` (worktree /home/user/crm-l3; commits locais, sem push)

## Objetivo

Melhorar as telas do atendente (só frontend): rascunho de tarefa, registrar contato em um toque, lista paginada, alertas de atraso agrupados, erros com mensagem real, AccessDenied, sessão com erro, alvos de toque, aviso de lista desatualizada, limpeza de páginas órfãs.

## Arquivos e áreas que vou tocar

- `client/src/pages/Tasks.tsx`, `AdminDashboard.tsx`, `Attendants.tsx`, `Orders.tsx` e `TvDashboard.tsx` (só se órfãos)
- `client/src/_core/hooks/useReminderNotifications.ts`, `client/src/components/AppShell.tsx`
- `client/src/lib/tasks/` (módulos novos), `tests/` (testes novos), `CLAUDE.md` (tabela de rotas)

**Não vou tocar em:** server/, api/index.ts, recovery, crons, emailMarketing, campaigns, zapContatos, auth.ts, trpc.ts.

## Progresso

- [x] itens 1 a 10 (item 10: só Orders.tsx removido; TvDashboard.tsx mantido porque tests/expediente.test.ts o lê)

## Resultado

1. Formulário de tarefa: fechar com texto escrito pede confirmação; rascunho em localStorage por usuário/tarefa, restaurado com aviso e "Descartar rascunho"; nunca restaura campo vazio sobre texto do servidor.
2. "Registrar contato" na linha expandida: nota + +30 min / Amanhã 9h / +3 / +7 dias; acrescenta "[dd/mm/aaaa hh:mm] texto" ao fim das anotações (getById fresco + tasks.update); recusa se passar de 5000.
3. Lista de 50 em 50 com "Mostrar mais" e contador.
4. Alertas de atraso agrupados em um aviso, "já avisado" em localStorage por usuário/dia (SP); timers "na hora" centralizados no hook.
5. Erros com a mensagem do servidor (lib/erroMensagem.ts).
6. AccessDenied em AdminDashboard e Attendants.
7. AppShell: falha na consulta da sessão mostra "Tentar de novo"; modais rolam.
8. Alvos de 44 px, lápis no celular.
9. Faixa "Não consegui atualizar a lista".
10. Orders.tsx removido; CLAUDE.md: /tv sem rota.

## Verificado

- `npm run check` 0 erros; `npx vitest run` (com variáveis de IA simuladas) 143 arquivos, 2000 testes, após merge de origin/main (lote 2); build:client e build:api OK, api/bundle.js sem mudança.
- Playwright com backend mockado: tela de tarefas 390x844 e 1280x800, diálogo "Descartar..." e rascunho gravado.

## Não verificado / pendente

- Bloco "Registrar contato" e "Mostrar mais" não foram exercitados no navegador; sem backend real.
- tasks.reminders só traz de ontem em diante: o "N tarefas atrasadas" conta essas; a aba Atrasadas mostra todas.
- A dica horária de "N lembretes em atraso" continua (agora no mesmo toast id do aviso agrupado).
