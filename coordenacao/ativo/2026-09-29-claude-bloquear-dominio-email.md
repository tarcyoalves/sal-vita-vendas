# Bloquear domínio de e-mail gruposmabrasil.com.br e apagar o que existir

- **Agente:** claude
- **Início:** 2026-09-29 12:00 BRT
- **Fim:** —
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Pedido do dono: bloquear qualquer e-mail do domínio `gruposmabrasil.com.br` no CRM e excluir o
que houver. Bloqueio permanente checado nos pontos de envio, na montagem de público e na entrada
de contatos de marketing; limpeza idempotente no build de produção.

## Arquivos e áreas que vou tocar

- `shared/blockedEmailDomains.ts` (novo), `tests/blocked-email-domains.test.ts` (novo)
- `server/email/resend.ts`, `server/email/marketing.ts` (só `sendBatch`), `server/email/marketingQuota.ts` (só `sendBatch`), `server/email/marketingEngine.ts` (só filtro do público)
- `server/routers/emailMarketing.ts` (só importação CSV), `server/routers/premiumEmailMarketing.ts` (só `addContact`)
- `scripts/purge-blocked-emails.ts` (novo), `package.json` (script + vercel-build)

## Progresso

- [ ] lista compartilhada + teste
- [ ] bloqueio nos envios / público / entradas
- [ ] script de limpeza
- [ ] check, testes, build, deploy READY
