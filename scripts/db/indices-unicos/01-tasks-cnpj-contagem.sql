-- BANCO: CRM (DATABASE_URL). SOMENTE LEITURA. Não executado pelo código nem pelo build.
-- Duplicatas de tasks.cnpj (cnpj normalizado = 14 dígitos).
SELECT cnpj, COUNT(*) AS qtd, array_agg(id ORDER BY id) AS ids
FROM tasks
WHERE cnpj IS NOT NULL AND length(cnpj) = 14
GROUP BY cnpj
HAVING COUNT(*) > 1
ORDER BY qtd DESC, cnpj;

-- Total de linhas "a mais" que a limpeza vai remover:
SELECT COALESCE(SUM(qtd - 1), 0) AS linhas_a_remover
FROM (SELECT COUNT(*) AS qtd FROM tasks WHERE cnpj IS NOT NULL AND length(cnpj) = 14 GROUP BY cnpj HAVING COUNT(*) > 1) d;
