-- BANCO: CRM (DATABASE_URL). SEM TRANSAÇÃO (CREATE INDEX CONCURRENTLY não roda dentro de BEGIN).
-- Só depois de 02 deixar 0 duplicatas.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS tasks_cnpj_uniq
  ON tasks (cnpj) WHERE length(cnpj) = 14;
