# Hotfix: migração lenta deixa colunas/tabelas novas sem existir (faturamento zerado de novo)

- **Agente:** claude
- **Início:** 2026-09-28 BRT
- **Fim:** 2026-09-28 BRT
- **Status:** concluído (confirmado nos logs; falta o dono ver na tela)
- **Branch:** `main`

## Objetivo

Logs de produção: `column "smbi_solicitado_em" does not exist` derruba `faturamento.getAll`,
`pendingApproval` e `/api/smbi/pedidos`. A migração completa (175 comandos sequenciais no
Neon HTTP) é abandonada em silêncio pelo `withTimeout` de 20 s e nunca termina, então o que
vem depois dos primeiros comandos não chega ao banco. Correção: passo rápido e barato que cria
o que falta (só se faltar) ANTES da migração longa + log quando o tempo estoura.

## Arquivos e áreas que vou tocar

- `server/db/migrate.ts` (função nova `ensureRecentSchema` no início de `ensureTablesExist`;
  tabelas do Radar movidas para função reutilizável; `SCHEMA_VERSION`)
- `api/index.ts` (só o `withTimeout`: passa a logar quando estoura)
- `tests/schema-version.lock.json`, `CHECKLIST-ALTERACOES.md`, `HANDOFF-HERMES.md` (aviso)

**Não vou tocar em:** regra de negócio do faturamento, robô, telas.

## Progresso

- [x] Correção rápida (`ensureRecentSchema`) + log de timeout — `7b9b8d6`
- [x] Deploy e confirmação nos logs (20:46: `/api/smbi/pedidos` 200, 25 pedidos)
- [x] Timer do aviso cancelado quando a migração termina antes (alarme falso)

---

## Resultado

A coluna `smbi_solicitado_em` passou a existir em produção; `faturamento.getAll`,
`pendingApproval` e `/api/smbi/pedidos` voltam a consultar `fat_orders`.

## Commits

`7b9b8d6` (passo rápido + log), `e12a1a3` (docs, caso N), e o commit desta finalização
(cancela o cronômetro do aviso). O deploy do `7b9b8d6` foi cancelado pela Vercel porque o
`e12a1a3` o substituiu na fila; o código dele está no deploy do `e12a1a3`.

## Verificado

- `npm run check` 0 erros; `npx vitest run --dir tests` 203 passando; bundle da API ok.
- Logs da Vercel, deploy `e12a1a3`: 500 às 20:44 (primeiro acesso, antes de a coluna existir)
  e 200 às 20:46 (`GET /api/smbi/pedidos` listou 25 pedidos pendentes).

## Não verificado / pendente

- Não vi a tela de faturamento no celular; a confirmação final é do dono.
- O primeiro acesso depois de um deploy pode falhar por alguns segundos enquanto o passo
  rápido cria a coluna (só quando ela ainda não existe).
- **Estrutural, decisão do dono:** a migração longa continua dependendo de terminar em 20 s.
  Mover para o build ou executar em lote único (`sql.transaction`).
- Os avisos `[startup] ... passou de N ms` que apareceram nos logs até o commit final eram em
  parte alarme falso (o cronômetro não era cancelado). Depois da correção, o aviso só sai
  quando a migração realmente estoura.

## Armadilhas

- Ver caso N em `HANDOFF-HERMES.md`: "deploy READY" não prova que o banco foi migrado.
- Commit em sequência rápida faz a Vercel CANCELAR o deploy anterior ainda na fila: confira
  qual deploy contém o seu commit antes de concluir que "não subiu".
