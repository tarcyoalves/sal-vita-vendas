-- BANCO: PREMIUM (ORDERS_DATABASE_URL). SOMENTE LEITURA. automation_runs NÃO está no banco do CRM.
SELECT cart_id, rule_name, COUNT(*) AS qtd, array_agg(id ORDER BY id) AS ids
FROM automation_runs
WHERE status = 'scheduled'
GROUP BY cart_id, rule_name
HAVING COUNT(*) > 1
ORDER BY qtd DESC;
