-- BANCO: CRM (DATABASE_URL). SOMENTE LEITURA.
SELECT campaign_id, lower(email) AS email_lc, COUNT(*) AS qtd, array_agg(id ORDER BY id) AS ids,
       array_agg(status ORDER BY id) AS status
FROM email_campaign_recipients
GROUP BY campaign_id, lower(email)
HAVING COUNT(*) > 1
ORDER BY qtd DESC;
