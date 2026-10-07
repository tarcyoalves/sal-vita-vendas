-- BANCO: CRM (DATABASE_URL). ESCREVE. Transação com backup.
-- Sobrevivente por (campanha, e-mail): enviado (sent) > maior progresso de status > menor id.
-- (A regra "convertida / maior contact_count" é de tarefas; aqui o que importa é não perder o 'sent'.)
BEGIN;
CREATE TABLE IF NOT EXISTS bkp_email_recipients_dup AS SELECT * FROM email_campaign_recipients WHERE false;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY campaign_id, lower(email)
           ORDER BY (status = 'sent') DESC, (status = 'sending') DESC, (sent_at IS NOT NULL) DESC, id ASC
         ) AS rn
  FROM email_campaign_recipients
)
INSERT INTO bkp_email_recipients_dup
SELECT r.* FROM email_campaign_recipients r JOIN ranked k ON k.id = r.id WHERE k.rn > 1
  AND NOT EXISTS (SELECT 1 FROM bkp_email_recipients_dup b WHERE b.id = r.id);

DELETE FROM email_campaign_recipients r USING bkp_email_recipients_dup b WHERE r.id = b.id;

SELECT campaign_id, lower(email) FROM email_campaign_recipients GROUP BY 1, 2 HAVING COUNT(*) > 1; -- deve ser 0 linhas
COMMIT;
