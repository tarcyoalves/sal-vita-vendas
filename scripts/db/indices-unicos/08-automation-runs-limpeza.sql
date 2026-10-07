-- BANCO: PREMIUM (ORDERS_DATABASE_URL). ESCREVE. Transação com backup.
-- Sobrevivente: a 'scheduled' mais antiga (menor id) — mantém o horário original da cadência.
-- As demais viram 'cancelled' (não são apagadas: o histórico fica coerente).
BEGIN;
CREATE TABLE IF NOT EXISTS bkp_automation_runs_dup AS SELECT * FROM automation_runs WHERE false;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY cart_id, rule_name ORDER BY id ASC) AS rn
  FROM automation_runs WHERE status = 'scheduled'
)
INSERT INTO bkp_automation_runs_dup
SELECT a.* FROM automation_runs a JOIN ranked k ON k.id = a.id WHERE k.rn > 1
  AND NOT EXISTS (SELECT 1 FROM bkp_automation_runs_dup b WHERE b.id = a.id);

UPDATE automation_runs a SET status = 'cancelled', cancelled_at = now(), updated_at = now()
FROM bkp_automation_runs_dup b WHERE a.id = b.id AND a.status = 'scheduled';

SELECT cart_id, rule_name FROM automation_runs WHERE status = 'scheduled' GROUP BY 1, 2 HAVING COUNT(*) > 1; -- 0 linhas
COMMIT;
