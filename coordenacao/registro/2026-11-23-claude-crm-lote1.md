# CRM lote 1 (anotações de tarefa, IA via gateway, polling, webhooks)

- **Agente:** claude
- **Início:** 2026-11-23
- **Fim:** 2026-11-23
- **Status:** parcial (commits locais na branch `crm-lote1`, sem push; falta merge em main e deploy)
- **Branch:** `crm-lote1` (worktree /home/user/crm-l1; commits locais, sem push)

## Objetivo

Quatro correções: (1) perda de notas/descrição ao editar tarefa; (2) ai.ts usar a cadeia de provedores de server/lib/llm.ts; (3) polling de 10 s do e-mail marketing Premium; (4) webhooks Resend/Brevo/Premium devolverem 500 em erro de banco.

## Arquivos e áreas que vou tocar

<Seja específico. É por esta lista que outro agente decide se pode trabalhar em
paralelo com você.>

- `client/src/pages/Tasks.tsx`, `server/routers/tasks.ts`
- `server/routers/ai.ts`, `server/lib/llm.ts` (só importar), `client/src/pages/AiChat.tsx`, AiAnalysis e tela de sugestão de abordagem
- `client/src/pages/SalVitaEmailMarketing.tsx`, `server/routers/premiumEmailMarketing.ts`
- `api/index.ts` (só handlers de webhook Resend/Brevo/Premium), `server/routers/resendWebhook.ts`
- testes novos em `tests/`

**Não vou tocar em:** <o que está fora do escopo, se ajudar a evitar dúvida>

## Progresso

- [x] 1 anotações de tarefa  - [x] 2 IA via cadeia compartilhada  - [x] 3 polling e-mail marketing Premium  - [x] 4 webhooks 500

---

## Resultado

1. Editar tarefa não apaga mais notes/description: o formulário só abre depois de tasks.getById (erro = não abre); o save só envia o que mudou; tasks.update ignora "" sobre texto existente sem `limparNotas`/`limparDescricao`.
2. ai.ts usa buildProviderChain (antigravity02 primeiro) via server/lib/aiChain.ts: fallback por provedor, 400 com tools tenta sem tools e segue, 5 rodadas de ferramentas, prazo de 50 s, SERVICE_UNAVAILABLE tipado ("A IA está indisponível agora. Avise o administrador."); analyzeAttendants/suggestSalesApproach lançam erro e as telas o mostram; limites de tamanho e cooldown na sugestão; subtítulo do AiChat neutro.
3. E-mail marketing Premium: polling de 5 min só com aba ativa e expediente, botão "Atualizar" (mutation refreshMetrics limpa o cache), getMetrics com cached() de 60 s.
4. Webhooks Resend (CRM), Brevo e Resend (Premium) respondem 500 em erro de processamento/banco; 200 só para evento ignorado/corpo não-objeto. Premium: await em try/catch, 500 se o insert do evento ou a supressão principal falhar.

## Commits

Na branch `crm-lote1` (ver `git log origin/main..crm-lote1`); nada em origin/main ainda.

## Verificado

- `npm run check` — 0 erros
- `npx vitest run` com ANTIGRAVITY02_*/GROQ_API_KEY simulados — 130 arquivos, 1859 testes passando
- `npm run build:client && npm run build:api` — OK; api/bundle.js regenerado e commitado

## Não verificado / pendente

- IA real (nenhum provedor foi chamado; fetch mockado) e telas no navegador (Tasks, AdminDashboard, E-mail Marketing Premium, 375 px).
- Sem índice único em email_events: com os webhooks devolvendo 500, um reenvio após gravação parcial pode DUPLICAR o evento. Índice/migração ficou para outro lote.
- analyzeAttendants/suggestSalesApproach sem nenhuma chave de IA agora também lançam SERVICE_UNAVAILABLE (antes devolviam texto "IA não configurada"). O chat mantém a resposta em texto.

## Armadilhas encontradas

- tasks.list não traz notes/description; qualquer tela nova que edite tarefa precisa carregar getById antes.
- tests/setup-env.ts limpa as variáveis de IA: teste que depende de provedor define as suas.
