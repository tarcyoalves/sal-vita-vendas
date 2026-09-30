# Radar: cliente ativo some para atendente; aviso de outro atendente

- **Agente:** claude
- **Início:** 2026-09-30
- **Fim:** 2026-09-30
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## Objetivo

Regra do dono: atendente não vê, na busca de empresas novas do Radar, quem já comprou ("ativo"). O resto
qualquer um pode pesquisar; a tela só avisa quando outro atendente está acompanhando.

## Arquivos tocados

- `server/lib/radar/clientesAtivos.ts` (novo), `server/routers/prospectingRadar.ts` (só `search`), `shared/radar.ts`
- `client/src/components/radar/LeadCard.tsx` (selo), `client/src/pages/RadarCargas.tsx` (nota ao atendente)
- `tests/radar-clientes-ativos.test.ts` (novo)

## Resultado

- Ativo = pedido faturado (por CNPJ) ou tarefa convertida (por CNPJ ou telefone).
- Atendente não recebe esses leads; admin e gerente recebem com o selo "Cliente ativo".
- Lead já em tarefa de outro atendente mostra "Outro atendente acompanha: Fulano" (só aviso, sem trava).
- "Minha carteira" não mudou: atendente continua vendo os próprios clientes e leads.

## Verificado

`npm run check` 0 erros; 316 testes; builds ok. A consulta SQL nova não rodou contra o banco antes do deploy.

## Não verificado / pendente

- Ainda NÃO feito: a "campanha de carga" (reserva de lead por atendente para não se baterem). O dono
  aceitou só o aviso por enquanto; a reserva fica como melhoria opcional.
