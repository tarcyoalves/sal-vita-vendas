# CRM lote 1 (anotações de tarefa, IA via gateway, polling, webhooks)

- **Agente:** claude
- **Início:** 2026-11-23
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
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

- [ ] <passo 1>
- [ ] <passo 2>

---

<!-- Preencha o resto AO CONCLUIR, antes de mover para coordenacao/registro/ -->

## Resultado

<O que mudou, do ponto de vista de quem usa o sistema.>

## Commits

<Hashes que estão em `origin/main`. Confira com:
`git merge-base --is-ancestor <hash> origin/main && echo "está em main"`>

- `abc1234` — <mensagem>

## Verificado

<O comando que você rodou e o resultado que viu. Só o que rodou nesta sessão.>

- `npm run check` — 0 erros
- `npm test` — N testes passando

## Não verificado / pendente

<O que você não conseguiu testar e por quê (sem acesso ao banco, depende de
dado real, etc.). O que ficou por fazer.>

## Armadilhas encontradas

<Qualquer coisa que pegaria o próximo agente de surpresa. Se for uma lição
geral, acrescente também na seção 7 do `HANDOFF-HERMES.md`.>
