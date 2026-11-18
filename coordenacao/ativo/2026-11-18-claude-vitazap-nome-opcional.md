# Vita Zap 0.7.58: {nome} opcional nos textos do dono

- **Agente:** claude
- **Início:** 2026-11-18
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (servidor também em `main`)

## Objetivo

Pedido do dono: a mensagem é livre, o marcador {nome} não pode ser obrigatório (cobrança do follow-up, reativação, Pedir à IA).
Contato sem primeiro nome só vai para "escreva você" se o texto escolhido usa {nome}.

## Arquivos e áreas que vou tocar

- `server/lib/zapIa.ts`, `tests/zap-ia.test.ts`
- `extensoes/vita-zap/` (followup-estilo, followup, followup-motor, pedido-motor, reativacao-motor, editores, testes, README, versão 0.7.58)

## Progresso

- [ ] servidor em main
- [ ] extensão, testes, zip
