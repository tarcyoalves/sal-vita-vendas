---
name: supabase-postgres-best-practices
description: Otimização de banco de dados relacional PostgreSQL em 8 pilares críticos (performance de queries, indexação composta, segurança RLS, concorrência FOR UPDATE, e integridade referencial).
metadata:
  author: supabase
  version: "1.0.0"
---

# Supabase Postgres Best Practices Skill

Guia de engenharia de performance, modelagem relacional e otimização para PostgreSQL no ecossistema Supabase e bancos de dados modernos baseados em Postgres.

## Os 8 Pilares de Excelência em PostgreSQL

### 1. Performance de Queries (CRÍTICO)
- **Elimine Sequential Scans em Tabelas Grandes**:
  - Crie índices B-Tree para colunas frequentemente filtradas em `WHERE`, `JOIN` ou `ORDER BY`.
  - Crie índices compostos respeitando a ordem de seletividade: `(coluna_igualdade, coluna_faixa/ordem)`.
  - Crie índices parciais para filtros comuns:
    ```sql
    CREATE INDEX idx_pedidos_pendentes ON site_orders (created_at) WHERE status = 'pending';
    ```
- Use `EXPLAIN (ANALYZE, BUFFERS)` para diagnosticar gargalos de tempo de execução e I/O de disco.

### 2. Gerenciamento de Conexões (CRÍTICO)
- Em ambientes Serverless (Vercel, AWS Lambda, Cloudflare Workers), utilize Connection Pooling (PgBouncer na porta `6543` no Supabase com modo `transaction`).
- Feche conexões ociosas e configure limites razoáveis de pool para evitar esgotar `max_connections`.

### 3. Segurança e Políticas RLS Otimizadas (CRÍTICO)
- Sempre adicione índice nas colunas utilizadas nas cláusulas `USING` das políticas RLS (ex.: `user_id`, `organization_id`). A falta de índice causa sequential scans em cada verificação de linha!
- Envolva chamadas `auth.uid()` com `(select auth.uid())` para permitir que o Postgres execute a função apenas uma vez por query em vez de reavaliar para cada linha:
  ```sql
  CREATE POLICY "Otimizada" ON tasks
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));
  ```

### 4. Design de Schema e Integridade (ALTO)
- Utilize tipos de dados adequados: `TIMESTAMPTZ` (sempre com fuso horário), `UUID` ou `BIGINT` gerado por identidade (`GENERATED ALWAYS AS IDENTITY`), `TEXT` em vez de `VARCHAR` arbitrário sem restrição.
- Defina restrições de integridade referencial com ações apropriadas (`ON DELETE CASCADE` ou `ON DELETE RESTRICT`).
- Crie índices explícitos em todas as Foreign Keys (o Postgres não cria automaticamente).

### 5. Concorrência e Bloqueios (MÉDIO-ALTO)
- Evite race conditions em mutações de estoque/reservas/cupons utilizando `FOR UPDATE` ou `FOR UPDATE SKIP LOCKED` para filas de trabalho concorrentes.
- Mantenha transações curtas (`BEGIN ... COMMIT`) para minimizar contenção de locks de tabela e linha.

### 6. Padrões de Acesso a Dados (MÉDIO)
- Elimine o problema de N+1 queries utilizando `JOIN`s relacionais ou agregando dados em queries compostas (`json_agg` / `json_build_object`).
- Utilize paginação eficiente baseada em cursor (`WHERE id > :ultimo_id ORDER BY id ASC LIMIT 50`) em vez de offsets profundos (`OFFSET 10000 LIMIT 50`).

### 7. Monitoramento e Diagnóstico (MÉDIO)
- Habilite e monitore `pg_stat_statements` para identificar as queries mais lentas e que consomem mais CPU/I/O.
- Verifique índices não utilizados com `pg_stat_user_indexes` antes de acumular sobrecarga de gravação.

### 8. Recursos Avançados (BAIXO-MÉDIO)
- Para colunas `JSONB`, utilize índices GIN (`USING GIN (dados jsonb_path_ops)`).
- Para buscas textuais, utilize `tsvector` com índice GIN ou extensões como `pg_trgm` com índices GiST/GIN.
