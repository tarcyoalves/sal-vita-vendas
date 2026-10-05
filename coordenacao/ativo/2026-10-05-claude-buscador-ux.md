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
