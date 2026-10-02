# HERMES (2026-10-02) - Envio Real dos 3 Vínculos e Auditoria do Movsai 1067

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** 3 vínculos manuais faturados no CRM via Rota 5 com sucesso (#5156, #5225 e Ruralshop); conferidos no banco Neon; auditoria do Movsai 1067 concluída; daemon contínuo desligado.
- **Branch:** `main`

---

## 1. Execução Real do Espelho Fiscal (Rota 5)

Comando executado:
`node smbi_espelho_daemon.mjs --once --pedido xb7kn5vje1zn,k91kcfmczgnt,tt2dmvss39gt`

### Resultados retornados pelo CRM Lembretes:
1. `xb7kn5vje1zn` (Ruralshop Campo Grande):
   - POST `/api/smbi/vinculos/xb7kn5vje1zn/resultado` ➔ HTTP 200: `estado=CONFERIDO`.
2. `k91kcfmczgnt` (#5156 - K de Oliveira B LTDA):
   - POST `/api/smbi/vinculos/k91kcfmczgnt/resultado` ➔ HTTP 200: `estado=CONFERIDO`.
3. `tt2dmvss39gt` (#5225 - Rudimar Moccellin):
   - POST `/api/smbi/vinculos/tt2dmvss39gt/resultado` ➔ HTTP 200: `estado=CONFERIDO`.

---

## 2. Auditoria e Evidência no Banco Neon (`fat_orders`)

1. **Pedido #5156 (`k91kcfmczgnt` - K de Oliveira B LTDA):**
   - Status: `faturado`
   - Data Faturamento: `2026-09-01`
   - NF-e: `878` (Sal: R$ 4.200,00 | Unitário: R$ 6,00)
   - CT-e: `822` (Frete Total: R$ 5.740,00 | Frete/t: R$ 328,00)
   - Peso Líquido: `17.500 kg` (700 sc 25kg)
   - Comissão: `3%` (R$ 126,00)
   - Movsai: `1022` | Estado: `CONFERIDO`

2. **Pedido #5225 (`tt2dmvss39gt` - Rudimar Moccellin):**
   - Status: `faturado`
   - Data Faturamento: `2026-09-02` (data da NF-e)
   - NF-e: `883` (Sal: R$ 7.680,00 | Unitário: R$ 6,00)
   - CT-e: `826` (Frete Total: R$ 15.872,00 | Frete/t: R$ 496,00)
   - Peso Líquido: `32.000 kg` (1.280 sc 25kg)
   - Comissão: `3%` (R$ 230,40)
   - Movsai: `991` | Estado: `CONFERIDO`

3. **Pedido Ruralshop (`xb7kn5vje1zn` - Ruralshop Campo Grande LTDA):**
   - Status: `faturado`
   - Data Faturamento: `2026-09-02` (data da NF-e)
   - NF-e: `884` (Sal: R$ 1.440,00 | Unitário: R$ 6,00)
   - CT-e: `827` (Frete Total: R$ 3.033,60 | Frete/t: R$ 505,60)
   - Peso Líquido: `6.000 kg` (240 sc 25kg)
   - Comissão: `3%` (R$ 43,20)
   - Movsai: `990` | Estado: `CONFERIDO`

---

## 3. Diagnóstico do Movsai 1067 no SMBI

- **Cliente:** `PEROLA DO MUCURI SUPERMERCADO E DISTRIBUICAO DE ALIMENTOS LT` (CNPJ 38.040.007/0001-00) em Carlos Chagas - MG.
- **Vendedor:** `EDSON GODEIRO` (10,44%).
- **Valor:** R$ 6.432,00.
- **Status:** **Estornado em 18/09/2026 às 15:48:48 por Tarcyo Alves** (`usuarioEstornoNome: "Tarcyo Alves"`).
- **NF-e:** Nunca foi gerada (`nfe: ""`).
- **Origem do Vínculo Antigo:** Foi um valor digitado inicialmente no pedido #5117 em setembro, quando a proposta foi lançada. O Tarcyo já atualizou o vínculo na tela para o Movsai correto (`1035`).

---

## 4. Estado Operacional
- Daemon contínuo: **desligado**.
- Robô SMBI: **inativo e desabilitado**.
- **Atenção:** No pedido #2068, o Tarcyo salvou apenas `1050`. Para consolidar os 40.000 kg (38 t + 2 t) e os dois CT-es (856 + 857), é necessário preencher `"1050, 1051"`.
