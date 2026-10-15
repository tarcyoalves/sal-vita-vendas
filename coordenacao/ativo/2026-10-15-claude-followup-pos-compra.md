# Follow-up pos-compra por e-mail (loja Premium)

- **Agente:** claude
- **Inicio:** 2026-10-15 BRT
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `main` (worktree premium-ui-audit, push via `HEAD:main`)

## Objetivo

Pedido do dono (plano em `docs/PLANO-FOLLOWUP-POS-COMPRA.md`, secao 8 prevalece): e-mails
pos-compra e relacionamento mensal para compradores novos, sem cupom, sem WhatsApp, sem base
antiga. Sequencias criadas DESLIGADAS; o dono liga no painel.

## Arquivos e areas que vou tocar

- `server/email/sequenceEngine.ts` (condicao nao atendida passa a pular o passo, `{link_loja}`, teto diario, encadeamento Pos-compra -> Relacionamento)
- `server/email/postPurchaseFollowup.ts` (novo: inscricao automatica, recompra, textos das sequencias)
- `server/email/marketingEngine.ts` (so o texto do cabecalho do layout: tirar "100% Natural")
- `server/db/ordersMigrate.ts` + `tests/schema-version.lock.json` (sequencias desligadas, versao nova)
- `api/index.ts` (cron: sequencias + inscricao; WhatsApp de recompra atras de REORDER_WHATSAPP) e `api/bundle.js` se regenerado
- `server/routers/premiumEmailMarketing.ts` (updateSequenceStep, metrica posvenda)
- `client/src/pages/SalVitaEmailMarketing.tsx`, `client/src/pages/Privacidade.tsx`
- `tests/premium-followup-pos-compra.test.ts` (novo)

**Nao vou tocar em:** pagamento, webhook, etiqueta automatica, schema.ts (sem coluna nova), SMBI.

## Progresso

- [ ] motor + inscricao + migracao
- [ ] cron, painel, privacidade, metrica
- [ ] testes, check, push, deploy
