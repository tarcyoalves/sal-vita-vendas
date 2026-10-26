# Vita Zap 0.7.22 — endurecer o envio automático

- **Agente:** claude
- **Início:** 2026-10-26
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `worktree-agent-a634ecd6aca9a2514` (sem push; integração a cargo do dono)

## Objetivo

Reconferir tudo imediatamente antes do clique do envio automático, confirmar o envio por
detector (sem `true` sem confirmação), persistir marcador "em voo" para não duplicar mensagem
ao reabrir o painel, exigir sinal positivo de conversa individual, ajustar textos e notas.

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/` (src/content, src/sidepanel/executor.ts, src/shared, tests, README, manifest, package.json)
- `client/public/vita-zap/` (artefatos gerados por `npm run publicar`)

**Não vou tocar em:** o CRM Lembretes (raiz), exceto o que `npm run publicar` gera.

## Progresso

- [ ] itens 1 a 8 da tarefa, com testes
