# Maps: mais palavras genéricas + lista gerada da própria base

- **Quem:** Claude · **Quando:** 2026-10-05
- Reprocesso das 118: 80 mantidas, 38 derrubadas (10 conferidas: todas erros reais).
  Mas 4 de 15 "válidas" ainda eram homônimas por palavra comum
  (empreendimentos/imobiliários, utilidades, business, tudo).
- `extract.py`: +palavras genéricas; carrega `generic_tokens.txt` (opcional) ao subir.
- Novo `gen_generic_tokens.py`: só lê `radar_establishments` e grava as palavras
  que aparecem em >= N empresas (padrão 120). Saída é só lista de palavras.
- Testes: 69 pytest.
