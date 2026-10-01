# SMBI: robô recebe um pedido por vez, nunca lote

- **Agente:** claude
- **Início:** 2026-10-01
- **Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## Regra do dono

Só criar pedido **individual**, depois do clique em "Enviar para SMBI". Nada de lote.

## O que mudou (CRM)

- `GET /api/smbi/pedidos` (robô ligado, sem `?simular=1`) agora devolve **no máximo 1 pedido** por consulta (o clique mais antigo; antes reservava até 20 de uma vez).
- Enquanto um pedido está reservado e sem resposta, a lista vem **vazia**. O próximo só sai depois do `POST .../retorno` (libera a reserva) ou quando a reserva vence (15 min).
- O UPDATE da reserva só vale se nenhum outro pedido estiver reservado sem resposta (`NOT EXISTS`), contra duas consultas simultâneas.
- `proximoPedidoIndividual` (server/lib/smbiFaturamento.ts) + 5 testes em `tests/smbi-contrato-etapas-2-3.test.ts`.
- `docs/INTEGRACAO-SMBI.md` atualizado.

## Para o Hermes

A trava `--max-criar 1` do robô continua valendo; agora o servidor também garante. O modo `?simular=1` continua listando tudo que entraria (sem reservar).

## Verificado

`npm run check`, `npx vitest run` (346 testes). **Não** testado contra o banco real; a janela de corrida entre duas consultas no mesmo milissegundo é coberta pelo `NOT EXISTS`, mas só testa de verdade com o piloto.
