-- BANCO: CRM (DATABASE_URL). SEM TRANSAÇÃO.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS sellers_user_id_uniq
  ON sellers (user_id) WHERE user_id > 0;
