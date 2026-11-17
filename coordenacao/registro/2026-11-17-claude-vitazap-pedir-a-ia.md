# Vita Zap 0.7.57: "Pedir à IA" (busca nas conversas por pedido em português) e "Orientações para a IA"

- **Agente:** claude
- **Início:** 2026-11-17
- **Fim:** 2026-11-17
- **Status:** parcial (servidor em `main`; extensão 0.7.57 só na branch, não publicada no site)
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

## Resultado
Servidor (main): `zapIa.interpretarPedido`, `zapIa.conferirPedido` e `orientacoes` opcional (<=1500) em todas as chamadas de IA. Extensão 0.7.57: aba "Pedir à IA" (plano editável, leitura só-leitura, lista de revisão, ações, prévia obrigatória, pedidos salvos) e "Orientações para a IA".

## Commits
main: claim `ccc6abf`, feat `063ca79`. Branch `claude/magical-fermi-wrdxjy`: o commit do servidor + commit da extensão 0.7.57.

## Verificado
Main (worktree, env de IA simulado): check 0 erros, 125 arquivos / 1791 testes. Extensão: tsc, build ok, `npm test` 1220 ok + só `publicacao.test.ts` (pré-existente); Chromium real 17/17 (`run-pedido.cjs`), zip local 0.7.57.

## Não verificado
IA real, WhatsApp real, deploy do servidor, `npm run publicar` NAO feito.

## Armadilhas
- `aplicarFiltros` exclui quem recebeu campanha há <14 dias: inadequado para BUSCAR (esses são justamente os alvos), por isso candidatas têm regra própria; a política de 14 dias fica no Executor.
- Orientações ficam em `chrome.storage` (vz.ia.*): trocar de usuário do CRM no mesmo Chrome não as apaga.
