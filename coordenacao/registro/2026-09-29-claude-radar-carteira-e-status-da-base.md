# Radar de Cargas: "Minha carteira" + painel da base

- **Agente:** claude
- **Início:** 2026-09-29
- **Fim:** 2026-09-29
- **Status:** concluído no código; aguardando deploy e uso real
- **Branch:** `main`

## Objetivo

O Radar não fazia nada porque a base da Receita (`radar_establishments`) nunca foi importada.
Pedido do dono: melhorar (itens 1 e 2 da análise).

## Arquivos tocados

- `server/lib/radar/portfolio.ts` (novo, lógica pura), `server/lib/radar/geo.ts` (`municipioByNomeUf`)
- `server/routers/prospectingRadar.ts` (só `carteira` e `baseStatus`), `shared/radar.ts` (tipos)
- `client/src/pages/RadarCargas.tsx`, `client/src/components/radar/{BaseStatusCard,CarteiraList}.tsx`
- `tests/radar-portfolio.test.ts` (novo)

## Resultado

- Aba **Minha carteira** (padrão): clientes, pedidos e leads do CRM no raio da cidade da carga, com
  última compra/valor, atendente e WhatsApp manual. Não depende da Receita. Admin/gerente vê tudo;
  atendente só os próprios pedidos e tarefas.
- **Painel da base** no topo: data da importação, empresas por UF, robô ligado/desligado; base vazia
  aparece em destaque com o que fazer.
- Botão "Buscar" cinza agora diz o motivo.

## Verificado

`npm run check` 0 erros; 289 testes; `build:client` e `build:api` ok localmente.

## Não verificado / pendente

- Deploy e a tela no navegador; as consultas SQL novas não rodaram contra o banco real.
- A cidade de tarefas vem do texto ("CIDADE - UF"); tarefa fora desse padrão não aparece.
- A base da Receita continua vazia até alguém rodar `scripts/radar/import-receita.ts` na VPS (Hermes).
- Ainda não feito: importador em um comando, ranking por porte, rota com várias cidades.
