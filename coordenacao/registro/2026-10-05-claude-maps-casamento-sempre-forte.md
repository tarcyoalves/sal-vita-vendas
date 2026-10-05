# Maps: casamento forte também em página de lugar + trava de DDD/UF

- **Quem:** Claude · **Quando:** 2026-10-05 · **Motivo:** conferência dos 10
  casamentos do lote de reprocessamento (relatório do Hermes): só 2-3 corretos;
  Supermercado Boniatti, Prefeitura de Santa Lúcia, Real Color, JC (SP) e
  Braspet passaram.
- Causa: o caminho de página de lugar ainda usava `matches_company` (cidade no
  endereço bastava); faltavam palavras genéricas (com, imp, exp, pets, real...).
- `maps.py`: `matches_company_strict` sempre; descarta se o DDD do telefone do
  Maps é de outra UF (`phone_ddd_conflicts_uf`, tabela das 9 UFs da base).
- `extract.py`: token distintivo >= 4 letras; lista genérica ampliada.
- Testes: 65 pytest (9 casos reais + DDD).
- Depois do deploy: reenfileirar as linhas 'pronto' do lote com maps ok
  (24 na leitura das 10:42) com prioridade 2 para reprocessar com a regra nova.
