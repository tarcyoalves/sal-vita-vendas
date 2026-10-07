-- BANCO: CRM (DATABASE_URL). SEM TRANSAÇÃO.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS email_campaign_recipients_campaign_email_uniq
  ON email_campaign_recipients (campaign_id, lower(email));
