# Contrato robô ⇄ CRM — etapa 1 (estabilidade)

- **Agente:** claude
- **Início:** 2026-09-29
- **Fim:** 2026-09-29
- **Status:** concluído no código; aguardando deploy e teste com o robô
- **Branch:** `main`

## Objetivo

Implementar as rotas 2, 8 e 9 do `CONTRATO-ROBO-CRM.md` (Hermes): retorno com estado/motivo,
batimento do robô e chave `roboAtivo`, com selo de motivo na tela e painel do robô.

## Arquivos e áreas tocadas

- `shared/smbiEstados.ts` (novo), `server/lib/smbi.ts`, `api/index.ts` (rotas SMBI)
- `server/db/schema.ts`, `server/db/migrate.ts` (`SCHEMA_VERSION 2026-09-29b`), `tests/schema-version.lock.json`
- `server/routers/faturamento.ts` (`smbiRoboStatus`, `setRoboAtivo`, clique zera estado, `atualizadoEm`)
- `client/src/components/faturamento/{OrderDetailDialog,SmbiRoboPanel}.tsx`, `client/src/pages/Faturamento.tsx`, `types.ts`
- `tests/smbi-estado.test.ts` (novo), `tests/smbi-api.test.ts`, `docs/INTEGRACAO-SMBI.md`

## Resultado

- Robô desligado por padrão; desligado, o servidor entrega lista vazia (`?simular=1` mostra sem liberar).
- Retorno grava estado/motivo; o atendente vê "por que não foi" no pedido.
- Batimento a cada ciclo; painel avisa "sem sinal" após 10 min.

## Verificado

`npm run check` 0 erros; 257 testes; `build:client` e `build:api` ok localmente.

## Não verificado / pendente

- Deploy, migração em produção (procurar `[migrate:build] ok`) e a tela no navegador.
- Nenhum teste contra o robô real. O Hermes precisa: enviar `estado` no retorno, chamar
  `/api/smbi/heartbeat` e usar `?simular=1` na simulação.
- **Etapas 2 e 3 do contrato** (rotas 3, 7, 4, 5 e 6) ainda não feitas.
- Decisão a confirmar com o dono: a chave nasce DESLIGADA, então depois do deploy ninguém recebe
  pedido até o admin ligar o robô na tela.
