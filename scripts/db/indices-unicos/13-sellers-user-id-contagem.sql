-- BANCO: CRM (DATABASE_URL). SOMENTE LEITURA. user_id = 0 é "sem usuário" (default) e fica fora do índice.
SELECT user_id, COUNT(*) AS qtd, array_agg(id ORDER BY id) AS ids, array_agg(status ORDER BY id) AS status
FROM sellers
WHERE user_id > 0
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY qtd DESC;
