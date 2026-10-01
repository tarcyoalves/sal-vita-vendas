# HERMES (2026-10-01) - Reenvio de Faturamentos com Espelho Completo e Mapeamento de Movsais Reais

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-01
- **Status:** Reenvio de faturamento concluído (itens reescritos) / Mapeamento de movsais reais finalizado
- **Branch:** `main`

## O que foi verificado e executado (com evidências)

1. **Pull do commit `d352db1`:**
   - Adicionada a nova rota `GET /api/smbi/ligados`.
   - Adicionado o espelho completo com reescrita do pedido de 1 item e suporte a `comissaoPct`.

2. **Auditoria de Comissão no SMBI nos 5 movsais:**
   - **Onde fica no SMBI:** No endpoint `movsai_select_ajax.php?movsai=<id>` (campos `vendedor_percentual` e `vendedor_comissao`) e na tela de pedido de venda (`vendedor` e `#vendedor_percentual`).
   - **Valores lidos:**
     - Movsai 1116 (Fabiana): 3,00% (Venda Direta - Analice)
     - Movsai 1117 (Juliana): 3,00%
     - Movsai 1071 (Jose do Nascimento): 3,00% (Venda Direta - Analice)
     - Movsai 1065 (Agro Pet): 3,00% (Venda Direta - Analice)
     - Movsai 1100 (Lourival): 3,00% (Venda Direta - Analice)
   - **Ajuste de piso com % compensado:** Nenhum dos 5 movsais teve comissão reajustada acima do padrão comercial para compensar piso de frete. Todos seguiram a taxa padrão de 3,00%. Conforme a instrução, `comissaoPct` não foi enviado.

3. **Reenvio dos Payloads de Faturamento:**
   - **1116** (`zpxqv3air93z`, Rota 3): `HTTP 200 { ok: true, alertaDesconto: false, status: 'faturado' }`
   - **1117** (`ir2zcck1prd2`, Rota 3): `HTTP 200 { ok: true, alertaDesconto: false, status: 'faturado' }`
   - **1071** (`hq7ra5rce4pb`, Rota 3): `HTTP 200 { ok: true, alertaDesconto: false, status: 'faturado' }`
   - **1065** (`lhr7z0vlh88e`, Rota 5): `HTTP 200 { ok: true, estado: 'CONFERIDO' }`
   - **1100** (`kiwuwvao6c9u`, Rota 5): `HTTP 200 { ok: true, estado: 'CONFERIDO' }`

4. **Conferência da Reescrita no Banco do CRM (`fat_orders`):**
   - Todos os 5 pedidos tiveram `itens` reescritos com base na NF-e e CT-e, e `itens_estimado_snapshot` gravado com os dados originais:
     - `lhr7z0vlh88e` (1065, Agro Pet): quantidade reescrita de 320 para **120 sacos**, peso de 8.000 para **3.000 kg**, frete **R$ 436,00/t**.
     - `hq7ra5rce4pb` (1071, Jose do Nascimento): valor unitário reescrito para **R$ 2,50/saco**, frete **R$ 520,00/t**.
     - `zpxqv3air93z` (1116, Fabiana): quantidade reescrita de 1.520 para **1.480 sacos** (37.000 kg), frete **R$ 451,60/t**.
     - `ir2zcck1prd2` (1117, Juliana): 80 sacos (2.000 kg), frete **R$ 451,60/t**.
     - `kiwuwvao6c9u` (1100, Lourival): 950 sacos (23.750 kg), frete **R$ 333,33/t**.

5. **Auditoria de Pedidos Ligados (`GET /api/smbi/ligados`):**
   - Fila retornou exatamente 2 pedidos:
     1. **`tjppz143k8ad`** (Arte Trigo Industrial LTDA, CNPJ 16.366.878/0001-85):
        - Ligado atualmente a: `1111` (excluído no SMBI).
        - **Movsai REAL no SMBI: `1074`**
        - Peso: 25.000 kg (1.000 sacos de Sal Refinado Vita 25kg)
        - NF-e: **954** | CT-e: **894** (Frete R$ 13.414,40, R$ 536,58/t) | Faturado em: 23/09/2026
        - Vendedor: ALYSSON SOUZA (3,00%)
     2. **`biyxyxairzra`** (CH NUTRI NUTRICAO E SUPLEMENTACAO ANIMAL LTDA, CNPJ 53970536000104):
        - Ligado atualmente a: `1112` (excluído no SMBI).
        - **Movsai REAL no SMBI: `1075`**
        - Peso: 7.000 kg (280 sacos de Sal Moído Fazendeiro 25kg)
        - NF-e: **955** | CT-e: **895** (Frete R$ 2.576,00, R$ 368,00/t) | Faturado em: 23/09/2026
        - Vendedor: VENDA DIRETA - ANALICE (3,00%)

6. **Estado de Serviços e Travas:**
   - `smbi-crm-sync.service` continua **inativo e desabilitado**.
   - `roboAtivo` continua desligado.
