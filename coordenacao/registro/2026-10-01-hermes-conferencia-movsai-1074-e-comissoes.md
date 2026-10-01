# HERMES (2026-10-01) - Conferência Estrita do Movsai 1074 e Comparativo de Comissões CRM vs SMBI

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-01
- **Status:** Auditoria finalizada; aguardando troca dos vínculos na tela pelo Tarcyo
- **Branch:** `main`

## 1. Conferência Estrita do Movsai 1074 (Arte Trigo)

Releitura aprofundada realizada diretamente no SMBI (`movsai_select_ajax.php`, `nfe_status_select_ajax.php`, `cte_select_grid.php` e tabela HTML `produtomovsai_model.php`):

- **Dados Fiscais e Físicos REAIS no SMBI:**
  - **Peso Líquido/Bruto:** **32.000 kg** (32,00 toneladas)
  - **Quantidade de Sacos:** **1.280 sacos** de 25 kg
  - **Produto:** SAL REFINADO COM IODO VITA 25 KG (Cód. 51)
  - **Valor Unitário do Sal:** **R$ 11,00 / saco**
  - **Valor Total do Sal (NF-e 954):** **R$ 14.080,00**
  - **Frete Total (CT-e 894):** **R$ 13.414,40**
  - **Frete por Tonelada:** **R$ 419,20 / t** (R$ 13.414,40 ÷ 32 t)
  - **Valor Total (Sal + Frete):** **R$ 27.494,40**

- **De onde surgiu a divergência anterior:**
  1. Os 25.000 kg (1.000 sacos) eram a estimativa inicial lançada no pedido #5238 do CRM (`tjppz143k8ad`).
  2. O valor de R$ 14.120,00 foi um erro de digitação/cálculo ao simular a divisão do frete por 25 t (13.414,40 ÷ 25 = 536,58).
  3. No SMBI, a NF-e 954 foi emitida e autorizada para exatamente **32.000 kg** e **R$ 14.080,00**.

## 2. Comparativo de Comissões (SMBI vs CRM)

| Movsai | Pedido CRM | Cliente | % SMBI | % CRM (`comissao_pct`) | % Fixo Item | Status | Ação (`comissaoPct`) |
|---|---|---|---|---|---|---|---|
| **1071** | `hq7ra5rce4pb` | JOSE DO NASCIMENTO | **3,00%** | **3,00%** | null | Faturado | **Não enviar** (Tarcyo ajustará no SMBI) |
| **1074** | `tjppz143k8ad` | ARTE TRIGO INDUSTRIAL | **7,00%** | **7,00%** | null | Estimado | **Não enviar** (Iguais) |
| **1075** | `biyxyxairzra` | CH NUTRI NUTRICAO | **3,00%** | **3,00%** | null | Estimado | **Não enviar** (Iguais) |
| **1065** | `lhr7z0vlh88e` | AGRO PET | **3,00%** | **3,00%** | null | Faturado | **Não enviar** (Iguais) |
| **1100** | `kiwuwvao6c9u` | LOURIVAL FLAVIO | **3,00%** | **3,00%** | null | Faturado | **Não enviar** (Iguais) |
| **1116** | `zpxqv3air93z` | FABIANA CASAVECHIA | **3,00%** | **3,00%** | null | Faturado | **Não enviar** (Iguais) |
| **1117** | `ir2zcck1prd2` | JULIANA CASAVECHIA | **3,00%** | **3,00%** | null | Faturado | **Não enviar** (Iguais) |

Em todos os casos, a taxa cadastrada no SMBI coincide com o CRM.

## 3. Estado das travas
- `smbi-crm-sync.service` inativo e desabilitado.
- `roboAtivo` falso.
- Pedido 1071 mantido intocado conforme determinação.
- Aguardando Tarcyo salvar os vínculos na tela para executar a Rota 5.
