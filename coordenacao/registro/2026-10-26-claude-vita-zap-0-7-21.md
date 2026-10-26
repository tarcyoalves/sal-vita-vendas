# Vita Zap 0.7.21: abrir conversa sem recarregar, telefone no Criar lead, vincular para admin, filtro "só conversa minha"

- **Agente:** claude
- **Início:** 2026-10-26
- **Fim:** 2026-10-26
- **Status:** parcial (commits só no branch do worktree, sem push, a pedido do dono)
- **Branch:** `worktree-agent-ae6ac809f51941292` (base `500f6b1` = origin/main, v0.7.20)

## Objetivo

Quatro pedidos do dono para a versão 0.7.21 da extensão `extensoes/vita-zap/`: (1) "Abrir conversa" de lembrete do
CRM sem recarregar o WhatsApp Web; (2) "Criar lead" a partir do chat preencher o telefone; (3) admin ver todos os
leads ao vincular, com o responsável; (4) campo "Só contatos com conversa já feita por mim (atendente)" na Varredura.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (src, tests, README, manifest/package/lock), `client/public/vita-zap/` (zip e versao.json
  gerados por `npm run publicar`), `api/bundle.js` (`npm run build:api`)
- `server/routers/tasks.ts` (só `findForWhatsapp`), `server/lib/whatsappLead.ts`, `tests/extensao-vita-zap.test.ts`

**Não toquei em:** lembretes (`tasks.reminders`), `meusLeadsFilter`, schema/migrações, loja Premium.

## Resultado

- Lembrete do CRM abre a conversa pela busca do WhatsApp (sem recarregar); `/send?phone=` só como fallback, com aviso.
- Criar lead sem telefone abre/lê/fecha "Dados do contato" (clique no nome do cabeçalho e no X, só leitura).
- Admin busca em todos os leads ao vincular e vê o responsável; demais papéis, faixa do lead e lembretes seguem individuais.
- Varredura/Prévia: campo marcado por padrão, persistido, com motivo "sem mensagem sua" e "Incluir mesmo assim".

## Verificado

- Extensão: `npm test` (563), `npx tsc --noEmit -p .`, `npm run build`, `npm run publicar`.
- Raiz: `npm run check`, vitest sem `extensoes/` (1528), `npm run build:api`.

## Não verificado / pendente

- Nada foi testado no WhatsApp real: seletores de "Dados do contato", do X, formatos aceitos pela busca por telefone
  e ícones/"Você:" da linha. Rodar o checklist do README (itens 0.7.21).
- Critério (c) do filtro usa só o índice local (nota/fase/conversão); lead do CRM Lembretes não é consultado na prévia.
- Push e deploy não feitos. O dono precisa copiar o dist / rodar o instalador e dar ↻ + F5.

## Armadilhas encontradas

- `tests/sem-envio-automatico.test.ts`: cliques simulados só em `abrir-conversa.ts` (agora 3 funções, travadas pelo teste).
  Strings com "send"/"enviar" em `src/content/` quebram o teste: a URL `/send?phone=` fica em `src/shared/crm-acoes.ts`.
- No jsdom do vitest, `new MouseEvent(..., { view: window })` falha; o WhatsApp falso de teste troca o MouseEvent.
- O `package-lock.json` da extensão estava em 0.7.4; foi sincronizado para 0.7.21.
