# Vita Zap 0.7.63 — varredura mais precisa (palavra inteira + região UF/DDD)

- **Agente:** claude
- **Início:** 2026-11-26
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `claude/magical-fermi-wrdxjy` (não toca em `main`)

## Objetivo

Pedido do dono: filtro do nome por PALAVRA INTEIRA (PR não casa com COMPRAS) e filtro de REGIÃO por UF ou DDD
(ex.: "PR, 41, 45, 46") na Prévia de campanha; mesma função pura nos públicos da Reativação e do "Pedir à IA".

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/src/shared/filtros.ts`, `nomes.ts`, novo `regiao.ts`, `exportar.ts` (schema opcional), `reativacao.ts`, `pedido-ia.ts`, `crm-telefone-conhecido.ts`
- `extensoes/vita-zap/src/sidepanel/Previa.tsx`, `Reativacao.tsx` (só palavra inteira), `preferencias.ts`
- `extensoes/vita-zap/tests/`, `README.md`, `package.json` (0.7.63), manifest/versão

**Não vou tocar em:** CRM Lembretes (raiz do repositório), `main`, `npm run publicar`.
