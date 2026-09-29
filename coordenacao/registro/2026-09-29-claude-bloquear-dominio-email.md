# Bloquear domínio de e-mail gruposmabrasil.com.br e apagar o que existir

- **Agente:** claude
- **Início:** 2026-09-29 12:00 BRT
- **Fim:** 2026-09-29
- **Status:** concluído
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

- [x] lista compartilhada + teste
- [x] bloqueio nos envios / público / entradas
- [x] script de limpeza
- [x] check, testes, build, deploy READY

---

## Resultado

`gruposmabrasil.com.br` (e subdomínios) não recebe mais nenhum e-mail do sistema, não entra em
público de campanha nem em contatos de marketing. O build de produção apaga o que existir.

## Verificado (log do build de produção, commit 4a06628)

Primeira execução do `purge:blocked`, CRM: `email_sequence_enrollments` 2 apagados,
`email_events` 2 apagados, `tasks.email` 8 esvaziados (as tarefas continuam), `email_suppressions`
1 semeado. Premium: `email_suppressions` 1 e `suppression_list` (domínio) 1 semeados. Contas de
login, atendentes e pedidos da loja com o domínio: 0. Nas execuções seguintes do mesmo build tudo
deu 0 (idempotente). Deploy concluído.

## Não verificado / pendente

- O envio bloqueado foi coberto por teste unitário da regra (`tests/blocked-email-domains.test.ts`);
  não foi feito um envio real de teste.
- Os 8 e-mails apagados de tarefas não são recuperáveis pelo CRM.
