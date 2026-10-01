# SMBI: faturamento parcial não marca o pedido como faturado

- **Agente:** claude
- **Início:** 2026-10-01
- **Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## Risco fechado

Com o robô checando faturamento sozinho (Etapa 2), um pedido com **mais de um movsai ligado** podia ser marcado como faturado quando só o primeiro saísse, e a comissão cairia para o peso parcial.

## O que mudou

- `resolverFaturamento`: se algum movsai ligado não veio no corpo, o espelho é guardado com `parcial: true`; **não** marca faturado, **sem** alerta de desconto e **sem** peso/total esperado (logo, sem efeito na comissão).
- `shared/smbiEstados.ts`: `parcial?` no espelho. Teste em `tests/smbi-contrato-etapas-2-3.test.ts` (362 testes). `docs/CONTRATO-ROBO-CRM.md` atualizado.

## Não verificado

Contra o banco real. O caso de pedido já faturado que receba um espelho parcial volta ao peso do pedido (fator 1).
