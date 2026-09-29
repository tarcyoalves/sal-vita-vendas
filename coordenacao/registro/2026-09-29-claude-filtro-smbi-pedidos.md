# Filtro "vinculados / não vinculados ao SMBI" na lista de pedidos

- **Agente:** claude
- **Início:** 2026-09-29
- **Fim:** 2026-09-29
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## Objetivo

Pedido do dono: filtro para ver os pedidos vinculados ao SMBI e os não vinculados.

## Arquivos tocados

- `client/src/components/faturamento/BillingReport.tsx` (só a aba "Pedidos" do Faturamento)

## Resultado

Seletor "SMBI" (Todos / Vinculados / Não vinculados), selo por linha ("SMBI 1071" ou "Sem SMBI") e
coluna "Pedido SMBI" no CSV. Vinculado = tem número de pedido do SMBI (criado pelo robô ou vínculo manual).

## Verificado

`npm run check` 0 erros; testes e `build:client` ok localmente.

## Não verificado / pendente

- Tela no navegador. O filtro respeita o mês selecionado; para ver todos, use "Todos" no mês.
