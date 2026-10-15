# Follow-up pos-compra por e-mail (loja Premium)

- **Agente:** claude
- **Inicio:** 2026-10-15 BRT
- **Fim:** 2026-10-15 BRT
- **Status:** concluido
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

---

## Resultado

Follow-up pos-compra por e-mail implementado (decisoes do dono: recompra em 30 dias para todos, sem cupom,
WhatsApp de recompra desligado, sem base antiga). Sequencias "Pos-compra" (4 e-mails) e "Relacionamento
mensal" (6, loop 30 dias) nascem DESLIGADAS; o dono revisa em Email Marketing > Automatizar e liga.
Cron diario roda cancelamento por recompra, inscricao de compradores novos (corte created_at >= 2026-10-15,
entregue ou 10 dias apos pagar, trava 'followup-enrolled' em shipping_events) e envio dos passos vencidos,
com teto FOLLOWUP_DAILY_CAP (padrao 40) so para sequencias. Conta do atraso do passo 3 em
`server/email/followupSequences.ts` (+12 e +10 dias: 26 a 32 dias da compra).

## Commits

- ver `git log origin/main --grep "post-purchase e-mail follow-up"`

## Verificado

- `npx tsc --noEmit` — 0 erros
- `npx vitest run` — so falham os 2 conhecidos do SMBI no Windows; 23 testes novos em tests/premium-followup-pos-compra.test.ts

## Nao verificado / pendente

- Nada rodou contra banco real nem envio real (sem rede). Conferir `[migrate:build]` no log de build.
- Ligar as sequencias no painel e, se quiser, ajustar FOLLOWUP_DAILY_CAP / BREVO_*.

## Armadilhas encontradas

- Motor: passo `if_not_*` com condicao nao atendida ficava vencido para sempre; agora e pulado. Envio que falhou
  nunca era refeito (indice unico); agora refaz. Sequencia desligada continuava enviando inscritos; agora nao.
- O layout compartilhado dos e-mails dizia "100% Natural" no cabecalho; removido.
- O cron tem retornos antecipados (WhatsApp fora, fora do horario): o follow-up roda antes deles.
