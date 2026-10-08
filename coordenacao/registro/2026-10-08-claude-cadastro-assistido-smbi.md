# Cadastro assistido CRM → SMBI (Fases 1 e 2, lado do CRM)

- **Quem:** Claude (arquiteto) com agentes Sonnet · **Início:** 2026-10-08 · **Spec:** plano do Hermes (cadastro assistido), versão enxuta
- **Fase 1 (UI):** client/src/components/faturamento/{BillingReport,SmbiPedidoControles,SmbiRoboPanel}.tsx, shared/smbiEstados.ts (só rótulos)
- **Fase 2 backend:** server/db/{schema,migrate}.ts, tests/schema-version.lock.json, shared/smbiCadastro.ts (novo), server/lib/smbiCadastro.ts (novo),
  server/smbiCadastroRoutes.ts (novo), api/index.ts (só montar), server/routers/faturamento.ts (procedures novas), tests/smbi-cadastro*.test.ts, docs/SMBI-CADASTRO-ASSISTIDO.md
- **Fase 2 frontend (depois):** SmbiCadastroClienteDialog.tsx, client/src/lib/faturamento/store.ts
- Gate `cadastro_ativo` DESLIGADO por padrão. Nada na VPS (ferramentas root/daemon) é editado aqui.

## Concluído (lado do CRM)
- 1f19862 Fase 1: selo 'Cliente não cadastrado no SMBI', bloco 'Cadastrar cliente' e botão que copia o pedido de cadastro para o Hermes.
- 8fb7905 Fase 2 backend: tabela smbi_client_registrations + gate cadastro_ativo (FALSE), rotas /api/smbi/cadastros*, procedures de
  prévia/contatos/aprovação/liberação, guarda de reenvio (falha aberta). SCHEMA_VERSION 2026-10-08a.
- Tela de aprovação (SmbiCadastroClienteDialog) + lógica pura + 18 testes.
- NADA ligado, instalado ou cadastrado. Pendente com o Hermes (VPS, root): ferramenta com --file/--gravar --confirmar, envelope de saída,
  orquestrador no daemon — contrato em docs/SMBI-CADASTRO-ASSISTIDO.md. Falta no CRM: campo de representante no formulário (só admin) e
  `cadastroAtivo` em smbiRoboStatus para o painel.
