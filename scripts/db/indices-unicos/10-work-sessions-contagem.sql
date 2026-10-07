-- BANCO: CRM (DATABASE_URL). SOMENTE LEITURA. Mais de uma sessão aberta por usuário.
SELECT user_id, COUNT(*) AS qtd, array_agg(id ORDER BY started_at DESC) AS ids, array_agg(status ORDER BY started_at DESC) AS status
FROM work_sessions
WHERE status IN ('active', 'paused')
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY qtd DESC;
