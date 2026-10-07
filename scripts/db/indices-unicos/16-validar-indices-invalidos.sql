-- Rode em CADA banco (CRM e Premium). CREATE INDEX CONCURRENTLY que falha (ex.: duplicata criada
-- durante a construção) deixa um índice INVÁLIDO: ele existe, consome escrita e NÃO impõe unicidade.
SELECT c.relname AS indice, i.indisvalid, i.indisready
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN (
  'tasks_cnpj_uniq', 'email_campaign_recipients_campaign_email_uniq',
  'automation_runs_cart_rule_scheduled_uniq', 'work_sessions_one_open_per_user_uniq', 'sellers_user_id_uniq'
);
-- indisvalid = false → refazer (cada comando SEM transação, um por vez):
--   DROP INDEX CONCURRENTLY IF EXISTS <indice>;
--   ...rodar de novo a contagem (01/04/07/10/13) e a limpeza, depois o arquivo de CREATE correspondente.
