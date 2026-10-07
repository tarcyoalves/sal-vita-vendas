-- BANCO: PREMIUM (ORDERS_DATABASE_URL). SEM TRANSAÇÃO.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS automation_runs_cart_rule_scheduled_uniq
  ON automation_runs (cart_id, rule_name) WHERE status = 'scheduled';
