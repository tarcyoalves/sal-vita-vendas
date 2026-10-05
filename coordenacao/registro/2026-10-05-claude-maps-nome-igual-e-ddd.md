# Maps: nome igual vence palavra genérica; DDD de outro estado só descarta o telefone

- **Quem:** Claude · **Quando:** 2026-10-05
- Dos 15 derrubados (relatório Hermes), 5 eram certos: Bunge, Americanas,
  Carrefour (SAC em SP), Caminhos Verdes/Doces Vovó Ana (DDD 24, divisa) e
  Supermercado União (palavras todas genéricas).
- `extract.matches_company_exact`: nome igual (sem sufixos jurídicos) ou, com
  >= 3 palavras, todas dentro do nome do Maps. `matches_company_strict` aceita
  isso antes da regra de palavra distintiva.
- `maps.py`: DDD de outro estado + nome igual => mantém o lugar do Maps e
  descarta só o telefone; nome só parecido => descarta tudo (homônima).
- Carrefour (nome do Maps com palavra a mais) continua derrubado por DDD: aceito.
- Testes: 78 pytest.
