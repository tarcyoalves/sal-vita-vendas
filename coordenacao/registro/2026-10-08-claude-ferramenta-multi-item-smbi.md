# Ferramenta multi-item do robô CRM → SMBI (versão corrigida)

- **Quem:** Claude · **Quando:** 2026-10-08 · **Pedido:** Tarcyo (pedido 2d7z7ng22ub5: 51 e 55 no mesmo movsai)
- Causa de "ainda não funciona": a ferramenta INSTALADA é mono-item (root, 0644; o Hermes não escreve) e o
  daemon, corretamente, bloqueia pedido de 2+ itens enquanto ela não declarar `SUPORTA_MULTI_ITEM = true`. O candidato
  do Hermes tinha a regex de data quebrada e não relia os itens.
- Entregue: `scripts/smbi-robo/smbi_criar_pedido_express.multi_item.mjs` + `INSTALAR-MULTI-ITEM.md` (passos e SHA-256)
  + `tests/smbi-multi-item-tool.test.ts` (10 testes das regras puras). NADA foi executado contra o SMBI.
- Pendente (Tarcyo/Hermes): instalar como root, `--dry-run` do pedido, anti-duplicidade no ERP, piloto real com OK do Tarcyo.
