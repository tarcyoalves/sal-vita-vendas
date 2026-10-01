# HERMES (2026-09-30 / 2026-10-01) - Robô SMBI: Trava Piloto e Faturamento Espelhado

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Início:** 2026-09-30 22:36 BRT
- **Fim:** 2026-10-01 10:45 BRT
- **Status:** Concluído (Etapa 2 faturamento espelhado enviado e verificado; robô pronto para o piloto da Etapa 1)
- **Branch:** `main`

## O que foi feito
1. **Trava no robô daemon (`smbi_robo_daemon.mjs`):**
   - Implementado suporte ao argumento `--max-criar <N>` para permitir piloto estritamente controlado de no máximo 1 criação por execução manual.
   - Integradas as regras do contrato: reserva atômica de 1 pedido por vez, checagem do token, conferência pós-criação no SMBI e comunicação estrita via HTTPS REST (sem acesso direto ao banco).
2. **Envio do Faturamento Espelhado (Rota 3 — `POST /api/smbi/pedidos/:id/faturamento`):**
   - Autorizado pelo Tarcyo para os 3 pedidos faturados no SMBI (`zpxqv3air93z`, `ir2zcck1prd2`, `hq7ra5rce4pb`).
   - Pedido `zpxqv3air93z` (Movsai 1116): status `estimado` → `faturado`, NF-e 967, CT-e 907, faturadoEm `2026-09-30T09:52:09-03:00`. Peso: 37 t faturadas de 38 t pedidas. `alertaDesconto: false`.
   - Pedido `ir2zcck1prd2` (Movsai 1117): status `estimado` → `faturado`, NF-e 968, CT-e 908, faturadoEm `2026-09-30T09:52:43-03:00`. Peso: 2 t faturadas de 2 t pedidas. `alertaDesconto: false`.
   - Pedido `hq7ra5rce4pb` (Movsai 1071): já estava `faturado`; preservou a data anterior (`2026-09-26`), atualizou o espelho fiscal com NF-e 944 e CT-e 884. `alertaDesconto: false`.

## O que foi verificado
- Respostas da API do CRM:
  - `zpxqv3air93z`: HTTP 200 `{"ok":true,"alertaDesconto":false,"status":"faturado"}`
  - `ir2zcck1prd2`: HTTP 200 `{"ok":true,"alertaDesconto":false,"status":"faturado"}`
  - `hq7ra5rce4pb`: HTTP 200 `{"ok":true,"alertaDesconto":false,"status":"faturado"}`
- Releitura direta do banco Neon confirmando gravação íntegra de `smbi_espelho_fiscal`, `numero_nfe`, `numero_cte`, `status`, e preservação dos valores comerciais e comissões.
- Testes da base: `npm run check` e `npx vitest run` (350 testes passando).
- Simulação do daemon com `--simular` e `--simular --max-criar 1` executando com saída limpa (exit 0).

## O que NÃO foi verificado / O que continua parado
- Piloto de criação real de pedido no SMBI: NÃO foi executado (aguardando ordem e clique do Tarcyo na tela para rodar `--max-criar 1` manualmente).
- `roboAtivo` continua desligado (`robo_ativo = false`).
- Suporte a múltiplos itens no SMBI (pedido Agroshop continua pendente por `MAIS_DE_UM_ITEM`; a ferramenta `smbi_criar_pedido_express.mjs` ainda aceita apenas 1 item).
