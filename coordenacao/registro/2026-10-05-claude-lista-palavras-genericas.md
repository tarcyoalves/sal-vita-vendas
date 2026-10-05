# Maps: lista de palavras genéricas da base versionada (825) + marcas de rede preservadas

- **Quem:** Claude · **Quando:** 2026-10-05
- `scripts/radar/enricher/generic_tokens.txt`: 825 palavras (>= 120 empresas),
  só palavras, nenhum dado de empresa. Gerada por `gen_generic_tokens.py`
  (Hermes). Revisada inteira: sobrenomes, nomes próprios e palavras de ramo.
- `extract.py`: `_BRAND_ALLOWLIST` (atacadao, americanas, cencosud, havan,
  zaffari, koch, aurora) sai da lista genérica; senão "Atacadão Dia a Dia"
  (que casava) deixaria de casar com "Atacadão Dia a Dia - Goiânia".
- Para o Hermes: o arquivo local dele e o do repo têm o mesmo conteúdo; ao dar
  pull pode haver conflito no generic_tokens.txt não rastreado — apague o local
  antes do pull (o do repo é o oficial). Restart do serviço só se ele quiser
  que a allowlist valha já (ela só afeta marcas de rede).
- Testes: 79 pytest.
