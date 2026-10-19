# Avisos informativos no dashboard do admin

- **Agente:** claude
- **Início:** 2026-10-19
- **Fim:** 2026-10-19
- **Status:** concluído
- **Branch:** `worktree-agent-ac59211a8bfa59f7f`

## Objetivo

Cards informativos fixos (sem banco/API) no dashboard do admin sobre a revisão do plano
Neon (26/10 e 29/10). Pedido do dono: não são lembretes do sistema.

## Arquivos e áreas que vou tocar

- `client/src/lib/avisosAdmin.ts` (novo)
- `client/src/components/AvisosAdmin.tsx` (novo)
- `client/src/pages/AdminDashboard.tsx` (1 import + 1 linha)
- `tests/avisos-admin.test.ts` (novo)
- `ESTADO-DO-PROJETO.md` (nota na seção 5)

**Não vou tocar em:** servidor, banco, `api/bundle.js`.

## Progresso

- [x] implementação e testes
