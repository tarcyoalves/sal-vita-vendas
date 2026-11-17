# Vita Zap 0.7.57: "Pedir à IA" (busca nas conversas por pedido em português) e "Orientações para a IA"

- **Agente:** claude
- **Início:** 2026-11-17
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só os commits do servidor vão para `main`

## Objetivo

Pedido do dono (17/11): "colocar um local para orientar a IA também, ex.: filtre os clientes que eu mandei mensagem perguntando
sobre estoque e não respondeu". (1) aba "Pedir à IA": pedido em português vira plano estruturado (confirmado pelo dono), a extensão lê as
conversas candidatas (só leitura) e a IA confere cada uma; resultado é lista para revisão, nada sai sozinho. (2) "Orientações para a IA":
regras fixas do dono (até 1500 caracteres) enviadas em todas as chamadas de IA, sempre abaixo das regras de segurança/LGPD/conformidade.

## Arquivos e áreas que vou tocar

- Servidor (vai para `main`): `server/lib/zapIa.ts`, `server/routers/zapIa.ts` (procedures `interpretarPedido`, `conferirPedido`; campo
  opcional `orientacoes` nas demais), `tests/zap-ia.test.ts`. Sem tabela nem coluna nova (sem SCHEMA_VERSION).
- Extensão (só na branch): `extensoes/vita-zap/src/shared/` (pedido*.ts, orientacoes.ts novos; servico-ia.ts, banco.ts, followup*.ts,
  reativacao*.ts), `sidepanel/` (PedirIa.tsx e motor novos; Followup.tsx, Reativacao*.ts, App.tsx), testes, versão 0.7.57.
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md`, `extensoes/vita-zap/README.md`.

**Não vou tocar em:** `coordenacao/ativo/2026-10-15-*` (análise de crédito), nenhum outro arquivo do CRM.
