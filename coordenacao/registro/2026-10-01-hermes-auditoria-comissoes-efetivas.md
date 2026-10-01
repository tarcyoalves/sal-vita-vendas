# HERMES (2026-10-01) - Auditoria de Comissões Efetivas no SMBI (Valor vs %)

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-01
- **Status:** Auditoria concluída / Aguardando troca dos vínculos na tela pelo Tarcyo
- **Branch:** `main`

## O que foi verificado e auditado (com evidências)

1. **Tabela de Auditoria de Comissões Efetivas no SMBI:**
   - Fórmula: `comissao_efetiva = (vendedor_comissao / valorSal_nfe) * 100`

| Movsai | Cliente | Vendedor | Perc. Cadastrado (`%`) | Comissão SMBI (`R$`) | Valor Sal NF-e (`R$`) | Valor Frete CT-e (`R$`) | Comissão Efetiva (`%`) | Compensação? |
|---|---|---|---|---|---|---|---|---|
| **1071** | JOSE DO NASCIMENTO | VENDA DIRETA - ANALICE | 3,00% | R$ 75,00 | R$ 2.500,00 (NF-e 944) | R$ 13.000,00 (CT-e 884) | 3,00% | Não (exatos R$ 75,00) |
| **1074** | ARTE TRIGO INDUSTRIAL LTDA | ALYSSON DE SOUZA SOARES | 7,00% | R$ 985,60 | R$ 14.080,00 (NF-e 954) | R$ 13.414,40 (CT-e 894) | 7,00% | Não (7,00% padrão Alysson) |
| **1075** | CH NUTRI NUTRICAO E SUPLEMENTACAO | VENDA DIRETA - ANALICE | 3,00% | R$ 50,40 | R$ 1.680,00 (NF-e 955) | R$ 2.576,00 (CT-e 895) | 3,00% | Não (exatos 3,00%) |
| **1065** | AGRO PET A CASA DO CRIADOR | VENDA DIRETA - ANALICE | 3,00% | R$ 21,60 | R$ 720,00 (NF-e 931) | R$ 1.308,00 (CT-e 873) | 3,00% | Não (exatos 3,00%) |
| **1100** | LOURIVAL FLAVIO DAS CHAGAS | VENDA DIRETA - ANALICE | 3,00% | R$ 332,03 | R$ 11.067,50 (NF-e 961)| R$ 7.916,59 (CT-e 901) | 3,00% | Não (exatos 3,00%) |
| **1116** | FABIANA CASAVECHIA GRANDO | VENDA DIRETA - ANALICE | 3,00% | R$ 266,40 | R$ 8.880,00 (NF-e 967) | R$ 16.709,20 (CT-e 907)| 3,00% | Não (exatos 3,00%) |
| **1117** | JULIANA CASAVECHIA GRANDO | - | 3,00% | R$ 14,40 | R$ 480,00 (NF-e 968)  | R$ 903,20 (CT-e 908)   | 3,00% | Não (exatos 3,00%) |

2. **Movsai 1071 (José do Nascimento):**
   - No SMBI, `vendedor_comissao` é de exatamente R$ 75,00, que corresponde a 3,00% sobre R$ 2.500,00.
   - Não há compensação em reais. Portanto, não requer reenvio.

3. **Comparativo do Pedido #5238 (Arte Trigo - `tjppz143k8ad`):**
   - **Antes (no CRM):**
     - Sal: 1.000 sacos (25.000 kg) a R$ 11,00 = R$ 11.000,00
     - Frete: R$ 0,00 (não discriminado)
     - Total Pedido: **R$ 11.000,00**
   - **Depois (com espelho do SMBI 1074):**
     - Sal: 1.280 sacos (32.000 kg) a R$ 11,00 = R$ 14.080,00 (NF-e 954)
     - Frete: R$ 419,20/t × 32 t = R$ 13.414,40 (CT-e 894)
     - Total Pedido: **R$ 27.494,40**

4. **Estado dos Serviços:**
   - `smbi-crm-sync.service` continua inativo e desabilitado.
   - `roboAtivo` desligado.
   - Monitorando `GET /api/smbi/vinculos` para envio das rotas 5 assim que o Tarcyo vincular na tela.
