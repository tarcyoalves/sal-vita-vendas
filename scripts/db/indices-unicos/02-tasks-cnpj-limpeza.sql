-- BANCO: CRM (DATABASE_URL). ESCREVE. Rode manualmente, de preferência fora do horário de uso,
-- depois de conferir 01-tasks-cnpj-contagem.sql. Tudo numa transação (psql -1 -f ... ou BEGIN/COMMIT).
-- Sobrevivente por CNPJ: convertida (converted_at preenchido) > maior contact_count > menor id.
BEGIN;

-- Backup completo das linhas que serão apagadas (e do mapa perdedora -> sobrevivente).
CREATE TABLE IF NOT EXISTS bkp_tasks_cnpj_dup AS SELECT * FROM tasks WHERE false;
CREATE TABLE IF NOT EXISTS bkp_tasks_cnpj_map (perdedora_id integer PRIMARY KEY, sobrevivente_id integer NOT NULL, cnpj text NOT NULL, feito_em timestamptz DEFAULT now());

WITH ranked AS (
  SELECT id, cnpj,
         FIRST_VALUE(id) OVER w AS sobrevivente_id,
         ROW_NUMBER()    OVER w AS rn
  FROM tasks
  WHERE cnpj IS NOT NULL AND length(cnpj) = 14
  WINDOW w AS (PARTITION BY cnpj ORDER BY (converted_at IS NOT NULL) DESC, contact_count DESC, id ASC)
)
INSERT INTO bkp_tasks_cnpj_map (perdedora_id, sobrevivente_id, cnpj)
SELECT id, sobrevivente_id, cnpj FROM ranked WHERE rn > 1
ON CONFLICT (perdedora_id) DO NOTHING;

INSERT INTO bkp_tasks_cnpj_dup SELECT t.* FROM tasks t JOIN bkp_tasks_cnpj_map m ON m.perdedora_id = t.id
WHERE NOT EXISTS (SELECT 1 FROM bkp_tasks_cnpj_dup b WHERE b.id = t.id);

-- Reaponta quem referencia a tarefa perdedora (task_id sem FK no schema: nada cascateia).
UPDATE email_campaign_recipients r    SET task_id = m.sobrevivente_id FROM bkp_tasks_cnpj_map m WHERE r.task_id = m.perdedora_id;
UPDATE email_sequence_enrollments e   SET task_id = m.sobrevivente_id FROM bkp_tasks_cnpj_map m WHERE e.task_id = m.perdedora_id;
UPDATE fat_orders o                   SET task_id = m.sobrevivente_id FROM bkp_tasks_cnpj_map m WHERE o.task_id = m.perdedora_id;
UPDATE radar_lead_events v            SET task_id = m.sobrevivente_id FROM bkp_tasks_cnpj_map m WHERE v.task_id = m.perdedora_id;

DELETE FROM tasks t USING bkp_tasks_cnpj_map m WHERE t.id = m.perdedora_id;

-- Confira ANTES do COMMIT: deve devolver 0 linhas.
SELECT cnpj, COUNT(*) FROM tasks WHERE cnpj IS NOT NULL AND length(cnpj) = 14 GROUP BY cnpj HAVING COUNT(*) > 1;

COMMIT;  -- se algo estranho: ROLLBACK;
-- Restaurar uma tarefa apagada: INSERT INTO tasks SELECT * FROM bkp_tasks_cnpj_dup WHERE id = <id>;
