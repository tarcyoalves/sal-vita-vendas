# HERMES (2026-09-30 / 2026-10-01) - Atualização do Robô SMBI para o Novo Contrato

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Status:** Ativo / Em andamento controlado
- **Branch:** `main`
- **Início:** 2026-09-30 22:36 BRT
- **Atualização:** 2026-10-01 10:15 BRT

## Objetivo
1. Implementar no robô daemon (`smbi_robo_daemon.mjs`) o contrato Etapa 1 (reserva com token, validação de payload, releitura/conferência pós-criação, busca prévia por marca `CRM:<id>`, heartbeat periódico e flag de simulação).
2. Adicionar trava `--max-criar <N>` para execução piloto controlada de no máximo 1 criação por vez.
3. Preparar a simulação da Etapa 2 (Faturamento Espelhado — Rota 3) para os 3 pedidos ligados (`movsais` 1116, 1117 e 1071) sem envio real.

## Arquivos e Áreas Tocadas
- `/home/ubuntu/.openclaw/workspace/smbi-robo/smbi_robo_daemon.mjs` (robô daemon na VPS)
- `coordenacao/ativo/2026-09-30-hermes-robo-smbi-novo-contrato.md` (registro de coordenação)

## O que foi verificado
- Robô daemon `smbi_robo_daemon.mjs` tem `--max-criar <N>` implementado e verificado via `node -c` (sintaxe válida).
- Testada execução de simulação: `node smbi_robo_daemon.mjs --simular` e `node smbi_robo_daemon.mjs --simular --max-criar 1` (exits 0, sem chamadas externas de escrita).
- Extraídos dados fiscais reais do SMBI para os movsais 1116, 1117 e 1071 (NF-e, CT-e, chaves, datas, valores e pesos).
- Payloads de faturamento espelhado montados e validados contra `faturamentoBodySchema` do Zod com sucesso (100% aderentes ao contrato da Rota 3).
- Comunicação do robô com o CRM é estritamente via HTTPS REST com Bearer `SMBI_SYNC_SECRET`; robô não possui conexão nem credencial do banco Neon.

## O que NÃO foi verificado / Pendente
- Criação real de pedido no SMBI pelo novo fluxo (aguardando piloto controlado de 1 item autorizado e acompanhado pelo Tarcyo).
- Envio real do faturamento espelhado para a API do CRM (`POST /api/smbi/pedidos/:id/faturamento`) — nenhum request foi enviado; aguardando aprovação explícita dos payloads pelo Tarcyo.
- Comportamento de pedidos com múltiplos itens no SMBI (ferramenta `smbi_criar_pedido_express.mjs` atualmente só aceita 1 produto por vez).
