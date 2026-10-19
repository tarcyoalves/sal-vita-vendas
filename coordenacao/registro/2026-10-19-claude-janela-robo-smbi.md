# Janela de atendimento do robô SMBI (economia de CU-h do Neon)

- **Agente:** claude
- **Início:** 2026-10-19
- **Status:** parcial (commit só no branch do worktree; api/bundle.js a reconstruir na integração)
- **Branch:** `worktree-agent-a6d20e9c12c64a575` (não vai para main nesta sessão; integração feita pelo responsável)

## Objetivo

O robô do SMBI chama o CRM a cada ~2 min e mantém o Neon acordado 24h. O CRM passa a atender o
polling só em 08:00-11:00 e 14:00-17:00 (America/Fortaleza). Fora disso, sem tocar no banco.

## Arquivos e áreas que vou tocar

- `shared/smbiJanela.ts` (novo)
- `api/index.ts` (só `GET /api/smbi/pedidos` e `POST /api/smbi/heartbeat`; NÃO api/bundle.js)
- `server/routers/faturamento.ts` (só `smbiRoboStatus`)
- `client/src/components/faturamento/SmbiRoboPanel.tsx`
- `tests/smbi-janela.test.ts` (novo)
- `docs/CONTRATO-ROBO-CRM.md`, `ESTADO-DO-PROJETO.md`

**Não vou tocar em:** demais rotas /api/smbi, análise de crédito, robô da VPS.

## Progresso

- [x] módulo, rotas, tela, testes, docs

## Verificado

- `npm run check` — 0 erros
- `npm test` — 1217 testes passando; 7 arquivos credito-*pdf* não carregam (pdfkit quebrado no node_modules do ambiente, alheio a esta mudança)

## Não verificado

- Rotas HTTP reais, Neon dormindo, build do bundle.

## Armadilhas

- `api/bundle.js` precisa de rebuild (`npm run build:api`) para a janela valer em produção.
