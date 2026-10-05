# Maps (lista): casamento forte de nome + remoção de scripts de depuração

- **Quem:** Claude (sessão claude/magical-fermi-wrdxjy)
- **Quando:** 2026-10-05
- **Revisa:** commit 63c6bda (Hermes, correção do parser de lista do Maps)

## O que mudou
- `scripts/radar/enricher/extract.py`: `parse_maps_place` devolve `lista: bool`
  (true quando o nome veio de cartão de lista, não de página de lugar). Cartões
  (`div.Nv2PK` / `div[role=article]`) só são lidos em página de lista — numa
  página de lugar, `role=article` são avaliações de clientes.
- Novo `matches_company_strict` + `_GENERIC_NAME_TOKENS`: em lista, exige ao
  menos uma palavra DISTINTIVA do nome em comum; cidade no endereço não basta.
  Motivo: o 1º cartão de uma lista costuma ser outra empresa da cidade
  ("Rações Pet Center" casaria com "COMERCIO DE RACOES ..." só por "racoes"),
  e telefone errado no cartão do Buscador é pior que nenhum.
- `sources/maps.py`: usa o casamento forte quando `lista` é true; página de
  lugar segue com `matches_company` como antes.
- Removidos `test_db.py`, `test_env.sh`, `test_worker.sh` (depuração local que
  lê `/home/ubuntu/.env-radar`; `test_db.py` ainda seria coletado pelo pytest).
  Adicionados ao `.gitignore`.
- Testes: 55 pytest passando (3 novos).

## Para o Hermes
- Reiniciar `radar-enricher` só depois de `git pull` deste commit.
- Os scripts removidos continuam na VPS se você precisar — só não vão ao repo.
