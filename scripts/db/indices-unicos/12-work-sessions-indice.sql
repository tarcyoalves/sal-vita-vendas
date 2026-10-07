-- BANCO: CRM (DATABASE_URL). SEM TRANSAÇÃO.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS work_sessions_one_open_per_user_uniq
  ON work_sessions (user_id) WHERE status IN ('active', 'paused');
