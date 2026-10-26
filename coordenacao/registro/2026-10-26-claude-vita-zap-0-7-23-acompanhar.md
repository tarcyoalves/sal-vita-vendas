# Vita Zap 0.7.23 — Acompanhar (botão na faixa do lead + aba)

- **Agente:** claude
- **Início:** 2026-10-26
- **Fim:** 2026-10-26
- **Status:** concluído (no branch; sem push)
- **Branch:** `worktree-agent-aec5c8ce72cd5db8e` (sem push)

## Objetivo

Pedido do dono: botão "Acompanhar" na faixa do lead (etiqueta do CRM "Acompanhar", pelo
`alterarEtiquetas` existente), selo "Em acompanhamento", "Marcar convertido" tira a etiqueta, e uma
aba "Acompanhar" (painel lateral + barra de abas do WhatsApp) com os leads em acompanhamento,
ordenados por vencido e dias sem contato. Sem polling; no máximo 1 consulta ao CRM a cada 15 min.

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/` (src/content/crm, src/sidepanel, src/shared, tests, README, manifest, package*.json)
- `client/public/vita-zap/` (gerado por `npm run publicar`)
- `server/routers/tasks.ts` e `server/lib/whatsappLead.ts` (procedure de leitura `tasks.acompanhando`
  com `meusLeadsFilter`; `toggleConverted` tira a etiqueta "Acompanhar"), `tests/extensao-vita-zap.test.ts`, `api/bundle.js`

**Não vou tocar em:** `coordenacao/ativo/2026-10-15-*` (análise de crédito) nem em nada do Premium.

## Resultado

Botão **Acompanhar** / **Parar de acompanhar** e selo "Em acompanhamento" na faixa do lead; **Marcar convertido** tira a
etiqueta; aba **Acompanhar** no painel lateral (lista ordenada, Abrir conversa sem recarregar, Registrar contato,
Reagendar) e na barra superior do WhatsApp (contador, vermelho se há vencido, filtra a lista). Cache local + 1 consulta
`tasks.acompanhando` ao abrir a aba (máx. 1 por 15 min) ou em Atualizar; sem polling.

## Commits (branch `worktree-agent-aec5c8ce72cd5db8e`)

- `1d3b8bc` — servidor: `tasks.acompanhando` + `toggleConverted` tira "Acompanhar" + testes
- `14eb9c0` — rebuild de `api/bundle.js`
- `d2b5e77` — extensão 0.7.23 (código, testes, README, versão)
- `1547fc1` — zip e `versao.json` publicados

## Verificado

- Extensão: `npm test` (682), `npx tsc --noEmit -p .`, `npm run build`, `npm run publicar`
- Raiz: `npm run check`, vitest sem `.claude/extensoes/node_modules` (1530), `npm run build:api`

## Não verificado / pendente

- Nada rodado no WhatsApp real nem contra o Neon de produção (só HTML sintético e CRM falso). Ver README seção 6.
- Não foi feito push: o servidor novo (`tasks.acompanhando`) só vale após o deploy; a extensão degrada para o cache.

## Armadilhas encontradas

- `crm-store.ts` (`sanearDados`) descarta `config.aba` desconhecida: toda aba fixa nova precisa entrar na lista de lá.
- O teste de `tasks.findForWhatsapp` fatia o fonte até `getById: protectedProcedure`; procedure nova entre as duas entra na fatia.
- `api/bundle.js` regenerado teve diff grande (esbuild reordena); conferir só `acompanhando`.
