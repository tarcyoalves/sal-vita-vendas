# Vita Zap — fase 1 (MVP sem IA) da extensão do WhatsApp Web

- **Agente:** claude
- **Início:** 2026-10-19 16:20 BRT
- **Fim:** 2026-10-19 17:10 BRT
- **Status:** parcial — implementado e testado no branch; **não está em `main`** e os seletores
  do WhatsApp Web **não foram validados** contra o site real
- **Branch:** `worktree-agent-abe727e6a3c0ac6b2` (sem push; o dono revisa e decide o merge).
  Inclui os 2 commits do plano (`e12abad`, `ce0a0f0`) que estavam só em `claude/magical-fermi-wrdxjy`.

## Objetivo

Implementar a fase 1 do `docs/PLANO-CAMPANHAS-WHATSAPP.md` (v2): extensão Chrome MV3
isolada em `extensoes/vita-zap/` (varredura só leitura, filtros, prévia, execução "uma
tecla", política embutida, IndexedDB, exportar/importar). Registrar no doc as decisões do
dono (número pessoal, sem linha "responda SAIR", IA Gemini só na fase 2 via proxy, teto 30/dia).

## Arquivos e áreas que toquei

- `extensoes/vita-zap/**` (pasta nova, package.json próprio)
- `docs/PLANO-CAMPANHAS-WHATSAPP.md` (status, seções 2, 3.5, 4 e 9)
- `vitest.config.ts` na raiz (novo — herda `vite.config.ts` e só exclui `extensoes/**`)
- `ESTADO-DO-PROJETO.md` (item 12 em "Código, ainda aberto")
- este arquivo

**Não toquei em:** `server/`, `client/`, `api/` (incluindo `api/bundle.js`), schema,
migrações, `vercel.json`, `vite.config.ts`, `tsconfig.json` da raiz.

## Progresso

- [x] Doc atualizado com as decisões (seção 9 → "Decididas")
- [x] Núcleo puro (datas, filtros, dedup, política, texto, campanha, exportação) + testes
- [x] Content script (seletores, varredura, abrir+colar, observação do envio), painel React, IndexedDB
- [x] README da extensão com build, carga, uso, limites, aviso dos Termos e checklist manual
- [x] Portões da raiz verdes

## Resultado

Extensão carregável (`npm run build` → `extensoes/vita-zap/dist`). Painel lateral com 4 abas:
Varredura, Prévia, Envio (modo uma tecla) e Dados (política, "não enviar mais", backup JSON,
CSV). Nenhum código envia mensagem; um teste de código-fonte reprova clique/teclado no envio.

## Verificado

- `extensoes/vita-zap`: `npm run build` ok; `npm test` — 8 arquivos, 158 testes passando.
- Raiz: `npm run check` — exit 0.
- Raiz: `npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' --exclude 'extensoes/**'`
  — 102 arquivos, 1385 testes. `npm test` (sem flags) — os mesmos 102/1385.
- Sem o `vitest.config.ts` novo, o vitest da raiz listava os 8 arquivos de teste da extensão
  (`npx vitest list --config vite.config.ts --filesOnly`) — por isso a exclusão.

## Não verificado / pendente

- **Seletores reais do WhatsApp Web** (busca, linhas, nome, data, cabeçalho, caixa de
  mensagem, `data-id`), o clique que abre a conversa, `execCommand('insertText')` no editor e
  a detecção do envio. Rodar o checklist manual (README, seção 7).
- Carregar no Chrome e abrir o painel não foi feito (sem navegador neste ambiente).
- Merge em `main`.

## Armadilhas encontradas

- O plano v2 estava só no branch `claude/magical-fermi-wrdxjy`, não em `main`.
- `npm install` (npm 10.9.7) quebra com `Cannot read properties of null (reading 'edgesOut')`
  ao resolver os peers opcionais do vitest 4 num projeto novo. `extensoes/vita-zap/.npmrc`
  usa `legacy-peer-deps=true`. A raiz não é afetada (`npm ci` com lockfile).
- O vitest da raiz não tinha config própria e varria o repositório inteiro: qualquer
  `*.test.ts` em pasta nova entra no portão de deploy. Pastas com projeto próprio precisam
  ficar no `exclude` do `vitest.config.ts` da raiz.
