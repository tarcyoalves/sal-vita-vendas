# Envio ao SMBI com escolha de empresa (A S Comércio / C Alves) — etapa 1 (CRM)

- **Quem:** Claude (arquiteto) + agentes Sonnet · **Início:** 2026-10-09 · **Spec:** plano multiempresa do Hermes, versão enxuta
- **Backend:** shared/smbiEmpresas.ts (novo), server/db/{schema,migrate}.ts, tests/schema-version.lock.json, server/lib/smbi.ts,
  server/smbiRoutes.ts, server/lib/smbiFaturamento.ts, server/smbiCadastroRoutes.ts + server/lib/smbiCadastro*.ts + shared/smbiCadastro.ts
  (cadastro por empresa+CNPJ), server/routers/faturamento.ts, api/index.ts (rotas /api/smbi/*), shared/smbiEstados.ts, tests/smbi-*.test.ts, docs/
- **Frontend (depois):** components/faturamento/{SmbiEmpresaEnvioDialog (novo),SmbiPedidoControles,BillingReport,SmbiCadastroClienteDialog}.tsx, lib/faturamento/{store,types}.ts
- Interruptor `multiempresa_ativo` DESLIGADO por padrão (fluxo atual intacto). C Alves só habilita após o mapa de códigos aprovado.
- Nada na VPS é editado aqui.

## Concluído
Backend 0c9650e; tela publicada em seguida (diálogo de empresa, interruptor, selo, vínculo e cadastro por empresa). Interruptor desligado por padrão. Não testado em navegador.
