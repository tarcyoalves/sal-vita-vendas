# Cadastro assistido CRM → SMBI (Fases 1 e 2, lado do CRM)

- **Quem:** Claude (arquiteto) com agentes Sonnet · **Início:** 2026-10-08 · **Spec:** plano do Hermes (cadastro assistido), versão enxuta
- **Fase 1 (UI):** client/src/components/faturamento/{BillingReport,SmbiPedidoControles,SmbiRoboPanel}.tsx, shared/smbiEstados.ts (só rótulos)
- **Fase 2 backend:** server/db/{schema,migrate}.ts, tests/schema-version.lock.json, shared/smbiCadastro.ts (novo), server/lib/smbiCadastro.ts (novo),
  server/smbiCadastroRoutes.ts (novo), api/index.ts (só montar), server/routers/faturamento.ts (procedures novas), tests/smbi-cadastro*.test.ts, docs/SMBI-CADASTRO-ASSISTIDO.md
- **Fase 2 frontend (depois):** SmbiCadastroClienteDialog.tsx, client/src/lib/faturamento/store.ts
- Gate `cadastro_ativo` DESLIGADO por padrão. Nada na VPS (ferramentas root/daemon) é editado aqui.
