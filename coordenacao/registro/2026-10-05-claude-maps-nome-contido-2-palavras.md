# Maps: nome contido com 2+ palavras (e medição do ganho)

- **Quem:** Claude · **Quando:** 2026-10-05
- Medição (Hermes, base inteira): 645 empresas com Maps ok; 310 (48,1%) com
  telefone fora da Receita; 134 (20,8%) com celular novo. O Maps compensa.
- Reprocesso das 172: 6 de 10 "novas derrubadas" eram a mesma empresa (Pet Mania,
  Quatro Patas; Americanas/Atacadão/Cencosud, que o restart não pegou por ter
  sido antes do 6ef451a).
- `extract.matches_company_exact`: contido com >= 2 palavras (era 3, por causa de
  um caso inventado no teste que nunca apareceu de verdade).
- Testes: 81 pytest. Sem mais refino de regra depois deste.
