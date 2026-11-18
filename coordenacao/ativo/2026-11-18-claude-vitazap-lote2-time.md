# Vita Zap 0.7.60, lote 2: "não enviar mais" e contato no CRM, tela Hoje, resultado por texto

- **Agente:** claude
- **Início:** 2026-11-18
- **Fim:** (preencher)
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só os commits do servidor vão para `main`

## Objetivo

Pedido do dono (lote 2): (1) "não enviar mais" e registro de contato compartilhados entre atendentes e computadores, com o CRM como fonte;
(2) tela "Hoje" (resumo só leitura) e barra de abas que cabe em 400 px; (3) resultado por texto (enviado / respondeu) só local.

## Arquivos e áreas que vou tocar

- Servidor (vai para `main`): `server/db/schema.ts`, `server/db/migrate.ts` (tabelas NOVAS `zap_opt_outs` e `zap_contatos_enviados`, `SCHEMA_VERSION`),
  `tests/schema-version.lock.json`, `server/lib/zapContatos.ts` (novo), `server/routers/zapContatos.ts` (novo), `server/routers/index.ts`, `tests/zap-contatos.test.ts` (novo).
- Extensão (só na branch): `extensoes/vita-zap/src/`, testes da extensão, versão 0.7.60.
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md`, `extensoes/vita-zap/README.md`, `ESTADO-DO-PROJETO.md`.

**Não vou tocar em:** o resto do CRM, o Premium, `zapCrm.ts`/`zapIa.ts` (fora o registro do router novo em `index.ts`).

## Progresso

- [ ] servidor: tabelas aditivas + router + testes
- [ ] extensão: sincronização do time (opt-out, contatado), Hoje, resultado por texto
- [ ] docs, testes, zip local (sem `npm run publicar`)
