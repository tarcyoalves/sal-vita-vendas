-- BANCO: CRM (DATABASE_URL). ESCREVE. Transação com backup.
-- Sobrevivente por user_id: 'active' > menor id. As demais NÃO são apagadas (outras tabelas guardam
-- seller_id, ex.: fat_orders/fat_commissions): ficam com user_id = 0 ("sem usuário") — sai do índice
-- e deixa de aparecer como login. REVISE as linhas do SELECT inicial antes: se a perdedora tem
-- pedidos/comissões e a sobrevivente não, reaponte seller_id manualmente antes do COMMIT.
BEGIN;
CREATE TABLE IF NOT EXISTS bkp_sellers_dup AS SELECT * FROM sellers WHERE false;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY (status = 'active') DESC, id ASC) AS rn
  FROM sellers WHERE user_id > 0
)
INSERT INTO bkp_sellers_dup
SELECT s.* FROM sellers s JOIN ranked k ON k.id = s.id WHERE k.rn > 1
  AND NOT EXISTS (SELECT 1 FROM bkp_sellers_dup b WHERE b.id = s.id);

UPDATE sellers s SET user_id = 0 FROM bkp_sellers_dup b WHERE s.id = b.id;

SELECT user_id FROM sellers WHERE user_id > 0 GROUP BY user_id HAVING COUNT(*) > 1; -- 0 linhas
COMMIT;
-- Reverter uma linha: UPDATE sellers s SET user_id = b.user_id FROM bkp_sellers_dup b WHERE s.id = b.id AND s.id = <id>;
