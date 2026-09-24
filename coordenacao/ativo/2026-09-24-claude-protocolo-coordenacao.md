# Protocolo de coordenação entre IAs

- **Agente:** claude
- **Início:** 2026-09-24 16:20 BRT
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Criar o protocolo que faz cada IA deixar registrado o que está alterando e o que
concluiu, para que agentes rodando em paralelo (Hermes/Antigravity, Claude,
Cursor, etc.) não colidam.

## Arquivos e áreas que vou tocar

- `coordenacao/` (novo)
- `HANDOFF-HERMES.md`, `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `ESTADO-DO-PROJETO.md`
- `.cursorrules`, `.windsurfrules`, `.kiro/steering/`, `CLAUDE_PROMPT.md`

**Não vou tocar em código** (`client/`, `server/`, `api/`).

## Progresso

- [x] Reivindicação criada e publicada
- [ ] Protocolo escrito
- [ ] Todas as IAs roteadas para ele
- [ ] Concluído e movido para `registro/`
