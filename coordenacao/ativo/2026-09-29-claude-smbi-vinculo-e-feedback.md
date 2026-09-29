# SMBI: vínculo com o ERP nunca pode ser apagado pela tela + feedback do botão

- **Agente:** claude
- **Início:** 2026-09-29 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

1. Achado nº 1 da auditoria do Hermes (e confirmado no código): `upsertPedido` deixa o payload
   de um ADMIN sobrescrever `smbiMovsaiId`/`numeroNfe`/`numeroCte`. Com o espelho desatualizado
   a tela manda `null`, o pedido volta à fila do robô e é duplicado no ERP. Esses três campos
   passam a ser gravados SÓ pela API do robô. `comissaoComercialProtegida` não é zerada por
   payload nulo.
2. O botão "Enviar pedido para SMBI" não mostra o que acontece depois: exibir "Solicitado em ...
   aguardando o robô" e explicar no toast.

## Arquivos e áreas que vou tocar

- `server/lib/smbi.ts` (função pura nova), `server/routers/faturamento.ts` (só `upsertPedido`)
- `client/src/components/faturamento/OrderDetailDialog.tsx` (só o bloco do botão SMBI)
- `tests/smbi-owned-fields.test.ts` (novo)

**Não vou tocar em:** migrações, schema, rota `/api/smbi/*`, robô, demais achados da auditoria.

## Progresso

- [ ] Correção + testes
- [ ] Feedback na tela
- [ ] Deploy
