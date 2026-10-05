# Buscador de Clientes: melhoria completa de experiência (Claude + 3 agentes Sonnet)

- **Agente:** claude (coordena) + 3 subagentes
- **Início:** 2026-10-05
- **Status:** ativo
- **Contrato já publicado:** índices `radar_establishments(telefone1|telefone2)` (SCHEMA_VERSION 2026-10-05a), `RadarPhone.compartilhadoPor`, `RADAR_TELEFONE_COMPARTILHADO_MIN`, `RadarSearchResult.{pagina,hasMore,ufsSemBase}`, input `search.pagina`.
- **Mexe em (não toque sem combinar):**
  - Agente A (servidor): `server/routers/prospectingRadar.ts` (search), `server/lib/radar/leads.ts`, testes novos de radar.
  - Agente B (tela): `client/src/pages/RadarCargas.tsx` e componentes NOVOS em `client/src/components/radar/`.
  - Agente C (cartão): `client/src/components/radar/LeadCard.tsx`, `phoneOptions.ts`, `CreateTaskDialog.tsx`, `EnrichmentSection.tsx`.
- **Não mexe:** migrate.ts, schema.ts, SMBI, faturamento, robôs da VPS.

## Resultado (2026-10-05)

- **Status:** concluído no código; publicado em `main`.
- Contrato `40d3868`; agentes: A servidor `fa5b3a7`, B tela `e3bdc5c`, C cartão `b084c04` (revisados e juntados pelo Claude).
- Servidor: contagem de empresas por telefone (índices novos) → `compartilhadoPor`; ranking (distância > telefone próprio > compartilhado > sem telefone > porte > nome) em `server/lib/radar/ranking.ts`; paginação (`pagina`/`hasMore`, descartados só na página 0); `ufsSemBase` com cache de 1 h por release.
- Tela: busca guardada em sessionStorage e refeita ao voltar (com rolagem); 5 cidades recentes; agrupamento por município; filtro de texto, segmento e ordenação; "Mostrar mais empresas"; aviso de UF fora da base; estados vazios com sugestão. Lógica pura em `client/src/components/radar/buscadorLogic.ts`. Polling de enriquecimento limitado às 200 primeiras da fila (limite do `enrichmentStatus`).
- Cartão: compacto (topo + WhatsApp/Ligar/Ir para a tarefa sempre visíveis + "Mais detalhes"); aviso "provável contabilidade · usado por N empresas" (>= 4) e escolha padrão evitando esses números; "Contatado por X há N dias"; porte e idade da empresa.
- Verificado: `npm run check`, vitest 28 arquivos / 409 testes, build do client e da API.
- **Não verificado:** nada visto no navegador nem rodado contra o banco real; custo da consulta de telefone em produção (medir); criação dos índices depende do deploy (SCHEMA_VERSION 2026-10-05a).
