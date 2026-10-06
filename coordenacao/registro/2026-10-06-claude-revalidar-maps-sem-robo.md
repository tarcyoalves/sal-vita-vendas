# Revalidar Maps gravado com a regra nova, sem abrir o Maps

- **Quem:** Claude · **Quando:** 2026-10-06
- Motivo: reprocessar as 511 antigas no robô levaria ~3 h. O resultado já guarda
  `maps.nome` e o telefone do Maps: basta reaplicar `matches_company_strict`.
- `scripts/radar/enricher/revalidate_maps.py`: dry-run por padrão (só lê);
  `--apply` grava em UMA transação: 'rejeitar' -> tira maps+telefones do Maps e
  volta à fila (priority 1); 'tirar_telefone' -> só remove o telefone do Maps.
- Testes: 83 pytest.
