# HERMES (2026-10-02) - Evidências: Rota 5 (CH Nutri), Rota 3 (1071 / 7,2%) e Mapeamento Big Bag 14

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** Evidências validadas e registradas com precisão de auditoria. Serviço e roboAtivo parados.
- **Branch:** `main`

## 1. CH Nutri (Pedido `biyxyxairzra`, Movsai 1075)

- **Confirmação:** O ID interno `biyxyxairzra` corresponde exatamente à tarefa **#5131** (`task_id: 5131`, CH Nutri Nutrição e Suplementação Animal LTDA).
- **Resposta da Rota 5:**
  - `POST /api/smbi/vinculos/biyxyxairzra/resultado`
  - Retorno HTTP: `200 OK`
  - Resposta JSON: `{ "ok": true, "estado": "CONFERIDO" }`
- **Estado Persistido no Banco de Produção (`fat_orders`):**
  - `status`: `'faturado'`
  - `smbi_movsai_id`: `'1075'`
  - `smbi_vinculo_estado`: `'CONFERIDO'`
  - `numero_nfe`: `'955'` (chave `24260951422900000168550010000009551556571050`, data `2026-09-23`)
  - `numero_cte`: `'895'` (chave `24260951422900000168570010000008951835625456`)
  - `faturado_em`: `'2026-09-23'`
  - `pesoKg`: `7000` (7.000 kg)
  - `quantidade`: `280` (280 sacos de 25 kg de `SAL DO FAZENDEIRO MOIDO 25 KG`)
  - `valorSal`: `R$ 1.680,00` (R$ 6,00/saco)
  - `valor_frete_por_unidade`: `368` (R$ 368,00/tonelada; Frete total no CT-e: `R$ 2.576,00`)
  - `comissao_pct`: `3` (3,00%)
  - `totalFiscal`: `R$ 4.256,00`

---

## 2. Movsai 1071 (`hq7ra5rce4pb` - José do Nascimento) — Atualização de Comissão

- **Releitura no SMBI (via API interna):**
  - `vendedor_percentual`: `7.20`%
  - `vendedor_comissao`: `R$ 180,00`
  - `valortotal` (Sal): `R$ 2.500,00` (1.000 sacos de 25 kg a R$ 2,50)
  - `nNF`: `944` | `nct`: `884` (Frete: R$ 13.000,00)
- **Reenvio da Rota 3 (`POST /api/smbi/pedidos/hq7ra5rce4pb/faturamento`):**
  - Payload: `{ comissaoPct: 7.2, faturadoEm: '2026-09-19', movsais: [...] }`
  - Retorno HTTP: `200 OK`
  - Resposta JSON: `{ "ok": true, "alertaDesconto": false, "status": "faturado" }`
- **Estado Persistido no Banco de Produção (`fat_orders`):**
  - `comissao_pct`: `7.2`%
  - `comissaoFixaPct` no item: `7.2`%
  - Sal Total: `R$ 2.500,00`
  - Valor da comissão apurada: `R$ 180,00` (exatamente 7,2% sobre R$ 2.500,00)

---

## 3. Big Bag Granulado no Robô (`cProd 14`)

- **Descrição Oficial no SMBI (consultada em `produto_select_ajax.php?produto=14`):**
  - `cProd`: `14`
  - `xProd`: `SAL GRANULADO EM BIG BAG 1.000 KG`
  - `peso`: `1000.00` kg
  - `uCom`: `T` (Tonelada)
  - `uTrib`: `KG`
  - `NCM`: `25010090`
- **Vínculo no Robô (`smbi_sync_crm_pedidos.mjs`):**
  - Produto no CRM: `SAL GRANULADO SEM IODO EM BIG BAG 1.000 KG`
  - Código SMBI: `14` (`SAL GRANULADO EM BIG BAG 1.000 KG`)
  - Mapeado com sucesso no catálogo oficial do robô.
