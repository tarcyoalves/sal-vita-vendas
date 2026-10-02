# HERMES (2026-10-02) - Processamento de Vínculos (#2068 e #3745) e Proposta do Modo Somente-Espelho

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** Vínculos manuais #2068 e #3745 conferidos e espelhados com sucesso na Rota 5. Proposta do modo `--somente-espelho` desenhada. Serviço do robô inativo e desabilitado.
- **Branch:** `main`

---

## 1. Evidências do Processamento da Fila de Vínculos (`GET /api/smbi/vinculos`)

### A) Pedido #2068 (`l853ovpzyzpv` ➔ Big Ben Agro LTDA)
- **Vínculo Solicitado:** Movsai `1051`.
- **Leitura no SMBI:**
  - Cliente: `BIG BEN AGRO LTDA` (CNPJ `12702241000242`).
  - Itens no SMBI: 80 sacos de `SAL DO FAZENDEIRO MOIDO 25 KG` (R$ 6,00/saco = R$ 480,00).
  - Peso faturado no SMBI: **2.000 kg (2,00 Toneladas)**.
  - Divergência de peso contra o pedido do CRM: O pedido original no CRM tem **40.000 kg (40 t)** em 2 itens (400 sacos Moído + 1.200 sacos Triturado). A NF-e faturou apenas **2.000 kg**.
  - NF-e `914`: Aprovada (status 100), valor R$ 480,00, emissão `2026-09-10`.
  - CT-e `857`: Aprovado (status 100), frete R$ 715,20 (R$ 357,60/t sobre 2 t).
  - Total fiscal: R$ 1.195,20.
  - Comissão no SMBI: **1,50%** (R$ 7,20). Como no CRM estava 3%, foi enviado `comissaoPct: 1.5`.
- **Envio Rota 5:**
  - `POST /api/smbi/vinculos/l853ovpzyzpv/resultado`
  - Resposta: `HTTP 200 { "ok": true, "estado": "CONFERIDO" }`.
- **Conferência no Banco (`fat_orders`):**
  - `status`: `'faturado'`
  - `smbi_vinculo_estado`: `'CONFERIDO'`
  - `numero_nfe`: `'914'` | `numero_cte`: `'857'` | `faturado_em`: `'2026-09-10'`
  - `comissao_pct`: `1.5`%
  - **Preservação de Itens Multi-Produto:** Os 2 itens do pedido permaneceram 100% preservados no CRM (sem reescrita automática, pois `itens.length > 1`).

---

### B) Pedido #3745 (`wnwu3v9dd44m` ➔ JVG Comercial LTDA)
- **Vínculo Solicitado:** Movsai `1009`.
- **Leitura no SMBI:**
  - Cliente: `JVG COMERCIAL LTDA.` (CNPJ `50524293000184`).
  - Itens no SMBI: 240 sacos de `SAL DO FAZENDEIRO MOIDO 25 KG` a R$ 5,08 = R$ 1.219,20.
  - Peso faturado no SMBI: **6.000 kg (6,00 Toneladas)** (bate exatamente com o pedido no CRM).
  - NF-e `888`: Aprovada (status 100), valor R$ 1.219,20, emissão `2026-09-04`.
  - CT-e `831`: Aprovado (status 100), frete R$ 2.413,74 (R$ 402,29/t sobre 6 t).
  - Total fiscal: R$ 3.632,94.
  - Comissão no SMBI: **3,00%** (R$ 36,58). Como no CRM já era 3%, **não foi enviado** `comissaoPct`.
- **Envio Rota 5:**
  - `POST /api/smbi/vinculos/wnwu3v9dd44m/resultado`
  - Resposta: `HTTP 200 { "ok": true, "estado": "CONFERIDO" }`.
- **Conferência no Banco (`fat_orders`):**
  - `status`: `'faturado'`
  - `smbi_vinculo_estado`: `'CONFERIDO'`
  - `numero_nfe`: `'888'` | `numero_cte`: `'831'` | `faturado_em`: `'2026-09-04'`
  - `comissao_pct`: `3`%
  - `itens`: 240 sacos a R$ 5,08 (R$ 1.219,20).

---

## 2. Proposta de Arquitetura: Daemon `--somente-espelho`

### Objetivo
Sincronizar continuamente vínculos manuais e faturamento fiscal do SMBI para o CRM de forma 100% segura, **sem qualquer capacidade de criar ou alterar pedidos no SMBI**, e independentemente da flag `roboAtivo`.

### Desenho da Rotina
1. **Script Dedicado e Isolado:** Criar `smbi_espelho_daemon.mjs` (isolado do `smbi_robo_daemon.mjs`).
2. **Ciclo Periódico (ex: a cada 60s):**
   - **Passo 1 (Vínculos Manuais):** Chama `GET /api/smbi/vinculos`. Para cada vínculo `PENDENTE_CONFERENCIA`, lê os movsais no SMBI (só `GET`). Se faturados, envia `POST /api/smbi/vinculos/:id/resultado` (Rota 5).
   - **Passo 2 (Acompanhamento de Ligados):** Chama `GET /api/smbi/ligados`. Para cada pedido que já tem `smbi_movsai_id` no CRM mas status não faturado, confere no SMBI se NF-e e CT-e foram aprovados. Se sim, envia `POST /api/smbi/pedidos/:id/faturamento` (Rota 3).
3. **Prova Estrutural de Inocuidade (Zero Criação no ERP):**
   - O arquivo `smbi_espelho_daemon.mjs` **não importa nem executa** `smbi_criar_pedido_express.mjs`.
   - Não contém nenhuma chamada a rotas `_insert`, `_update` ou `venda_resumida_form.php` do SMBI.
   - Não consome a rota `GET /api/smbi/pedidos` (que entrega pedidos pendentes de criação).
   - Um script de auditoria `grep -E "criar|insert|SCRIPT_CRIAR|venda_resumida" smbi_espelho_daemon.mjs` retornará estritamente vazio.
