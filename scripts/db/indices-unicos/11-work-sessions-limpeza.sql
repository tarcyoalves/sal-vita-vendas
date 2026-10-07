-- BANCO: CRM (DATABASE_URL). ESCREVE. Transação com backup.
-- Sobrevivente por usuário: 'active' mais recente; senão 'paused' mais recente. As demais são ENCERRADAS
-- (não apagadas) com fim = último sinal de vida (updated_at, nunca antes do início) — mesma regra do
-- código (server/lib/workHours.ts). Sem batimento, updated_at = início → fim = início (0 h); ajuste
-- manualmente se quiser aplicar a regra de 8 h do app para sessões esquecidas.
BEGIN;
CREATE TABLE IF NOT EXISTS bkp_work_sessions_dup AS SELECT * FROM work_sessions WHERE false;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY (status = 'active') DESC, started_at DESC, id DESC) AS rn
  FROM work_sessions WHERE status IN ('active', 'paused')
)
INSERT INTO bkp_work_sessions_dup
SELECT w.* FROM work_sessions w JOIN ranked k ON k.id = w.id WHERE k.rn > 1
  AND NOT EXISTS (SELECT 1 FROM bkp_work_sessions_dup b WHERE b.id = w.id);

UPDATE work_sessions w
SET status = 'ended',
    ended_at = GREATEST(w.started_at, w.updated_at),
    total_paused_ms = w.total_paused_ms
      + CASE WHEN w.status = 'paused' AND w.paused_at IS NOT NULL
             THEN GREATEST(0, (extract(epoch FROM (GREATEST(w.started_at, w.updated_at) - w.paused_at)) * 1000)::bigint)::integer
             ELSE 0 END,
    paused_at = NULL,
    updated_at = now()
FROM bkp_work_sessions_dup b
WHERE w.id = b.id AND w.status IN ('active', 'paused');

SELECT user_id FROM work_sessions WHERE status IN ('active', 'paused') GROUP BY user_id HAVING COUNT(*) > 1; -- 0 linhas
COMMIT;
