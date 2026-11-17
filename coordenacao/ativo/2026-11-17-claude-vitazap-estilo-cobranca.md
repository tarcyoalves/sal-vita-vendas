# Vita Zap 0.7.55: o dono define o estilo da mensagem de cobrança

- **Agente:** claude
- **Início:** 2026-11-17
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só o commit do servidor vai para `main`

## Objetivo

Pedido do dono (17/11): "eu que tenho que definir o estilo de mensagem". Os textos genéricos de modelo da cobrança automática
deixam de ser usados. O dono escreve as variações da 1ª e da 2ª cobrança ({nome}) ou deixa a IA escrever no estilo dele
(instruções + os textos dele como exemplos). Sem texto salvo, a cobrança automática não liga.

## Arquivos e áreas que vou tocar

- Servidor (vai para `main`): `server/lib/zapIa.ts`, `server/routers/zapIa.ts` (campos opcionais `estilo` e `exemplos` em `gerarCobranca`), `tests/zap-ia.test.ts`
- Extensão (só na branch): `extensoes/vita-zap/src/shared/followup.ts`, `shared/followup-estilo.ts` (novo), `shared/servico-ia.ts`,
  `shared/servico-crm.ts`, `shared/leads.ts`, `sidepanel/followup-motor.ts`, `sidepanel/Followup.tsx`, testes `tests/followup-*.test.ts`, versão 0.7.55
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md` (seção 10), `extensoes/vita-zap/README.md`

**Não vou tocar em:** `coordenacao/ativo/2026-10-15-*` (análise de crédito), nenhum outro arquivo do CRM.

## Progresso

- [ ] servidor: estilo/exemplos em gerarCobranca + testes (commit no branch e cherry-pick para main)
- [ ] extensão: config, validação, sorteio, motor, tela, testes, build, zip local
