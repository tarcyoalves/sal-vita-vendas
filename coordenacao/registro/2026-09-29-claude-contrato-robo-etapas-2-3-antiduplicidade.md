# Contrato robô ⇄ CRM — etapas 2 e 3 + anti-duplicidade

- **Agente:** claude
- **Início:** 2026-09-29
- **Fim:** 2026-09-29
- **Status:** concluído no código; aguardando deploy e teste com o robô real
- **Branch:** `main`

## Objetivo

Pedido do dono: "faça" (etapas 2 e 3 do `CONTRATO-ROBO-CRM.md`) e "deixe tudo ok para evitar
duplicidade e só mandar para o SMBI quando eu clicar em enviar".

## Arquivos e áreas tocadas

- `server/lib/smbiFaturamento.ts` (novo, regras puras), `server/smbiRoutes.ts` (novo, rotas 3, 4, 5 e 7)
- `api/index.ts` (lista do robô com reserva atômica; retorno libera a reserva)
- `server/lib/smbi.ts` (elegibilidade), `shared/smbiEstados.ts`
- `server/db/schema.ts`, `server/db/migrate.ts` (`SCHEMA_VERSION 2026-09-29d`), `tests/schema-version.lock.json`
- `server/routers/faturamento.ts` (clique travado, cancelar, vincular N movsais, desvincular, confirmar, histórico)
- `client/src/components/faturamento/{SmbiPedidoControles,OrderDetailDialog}.tsx`, `client/src/lib/faturamento/{store,types}.ts`
- `tests/smbi-contrato-etapas-2-3.test.ts` (novo), `tests/smbi-api.test.ts`, `docs/INTEGRACAO-SMBI.md`, `HANDOFF-HERMES.md`

## Resultado

- **Reserva atômica** por ciclo (15 min) + re-checagem `?id=&token=`: dois ciclos nunca recebem o mesmo pedido.
- **Sem retentativa automática:** `PENDENTE`/`ERRO`/`DIVERGENTE` só voltam com novo clique.
- **Clique travado no servidor:** pedido faturado, vinculado ou reservado pelo robô não pode ser enviado;
  "Cancelar envio" desfaz clique por engano.
- **Faturado espelhado** (N movsais, alerta de desconto sem tocar comissão), **linha do tempo**
  (`EXCLUIDO_SMBI` desfaz vínculo), **vínculo manual** com conferência do robô, desvincular auditado.
- Ações do SMBI na tela deixam de ser otimistas (a tela só muda depois da resposta do servidor).

## Verificado

`npm run check` 0 erros; 281 testes; `build:client` e `build:api` ok localmente.

## Não verificado / pendente

- Deploy, migração em produção (`[migrate:build] ok`) e a tela no navegador.
- **A reserva atômica (UPDATE condicional) não foi exercitada contra um banco real**; só a lógica pura
  tem teste. Ver o comportamento com o robô em simulação antes de ligar.
- O robô do Hermes precisa adotar: `token` na re-checagem, `estado` no retorno, heartbeat, `simular`,
  rotas 3/5/7 e a marca `CRM:<id>`. Robô antigo (sem token) fica parado, por segurança.
- A chave `roboAtivo` nasce DESLIGADA: ninguém recebe pedido até o admin ligar na tela.
- Pedido `hq7ra5rce4pb` (1115 → 1071) ainda precisa ser vinculado pelo dono.
- Tarefas de comissão: o espelho fiscal nunca altera comissão, mas marcar o pedido `faturado` pela
  rota 3 entra no faturamento do mês pela data informada pelo robô — o dono deve conferir o primeiro caso real.
