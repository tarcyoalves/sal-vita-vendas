# Hotfix: migração lenta deixa colunas/tabelas novas sem existir (faturamento zerado de novo)

- **Agente:** claude
- **Início:** 2026-09-28 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
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

- [ ] Correção rápida + log de timeout
- [ ] Deploy e confirmação nos logs
