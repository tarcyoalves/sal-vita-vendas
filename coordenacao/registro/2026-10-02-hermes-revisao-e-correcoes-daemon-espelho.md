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

---

## 5. Implementação Multi-Item (1 a 6 itens) e Simulações de Vínculos

### 5.1 Implementação e Testes das 6 Regras de Multi-Item:
1. **Trava Intermediária Estrita:** Se a adição de um item falhar no SMBI após o 1º item já ter criado o pedido (`docId`), o robô **PARA IMEDIATAMENTE**, não adiciona os itens restantes, não tenta de novo, grava a falha e devolve `ERRO` com motivo `CRIACAO_FALHOU` informando o número exato do movsai incompleto gerado para intervenção manual.
2. **Conferência Completa de Todos os Itens:** Após salvar no SMBI, a ferramenta relê o cabeçalho e todas as linhas da tabela de itens, conferindo produto, quantidade, valor unitário, subtotal e total do pedido. Se divergir em qualquer item, devolve `DIVERGENTE_APOS_CRIAR`.
3. **Catálogo e Bloqueios:** Todos os itens precisam casar com o catálogo oficial. Big Bag (código 14) e Churrasco Nota 10 permanecem bloqueados (retornam `PRODUTO_SEM_CODIGO`).
4. **Travas de Peso e Preço por Item:** `pesoKg / quantidade` validado com tolerância de 0.05 kg contra o produto cadastrado; valores unitários validados por faixa razoável por produto. Violação retorna `PRECO_INVALIDO` com `motivoTexto` explicativo. Motivos restritos aos 7 contratuais.
5. **Marca e Busca Prévia:** Marca `CRM:<id>` injetada na observação do pedido, com verificação prévia no SMBI para evitar duplicidade.
6. **Limite de 6 Itens:** Pedidos com mais de 6 itens devolvem `MAIS_DE_UM_ITEM` e permanecem `PENDENTE` para criação manual.
- **Testes Unitários:** Arquivo `/home/ubuntu/.openclaw/workspace/smbi-robo/test_multi_item_robo.mjs` com 8/8 testes cobrindo todos os cenários com sucesso.

### 5.2 Simulação de Pedido Real de 2 Itens:
- **Pedido CRM:** `1n24vlhfw8wh` (#306 - AGROPECUARIA MF LTDA - SC).
- **Item 1:** 400x SAL DO FAZENDEIRO MOIDO 25 KG (10.000 kg a R$ 6,00/sc = R$ 2.400,00) ➔ SMBI Cód. 1.
- **Item 2:** 100x SAL DO FAZENDEIRO GROSSO 25 KG (2.500 kg a R$ 6,00/sc = R$ 600,00) ➔ SMBI Cód. 3.
- **Total:** 500 sacos (12,5 t), R$ 3.000,00 sal, Frete R$ 496,00/t, Marca `CRM:1n24vlhfw8wh`.

### 5.3 Vínculos Fiscais Manuais (#5117 e #2068) — Auditoria de Datas e Envio Real:
- **Auditoria de Datas no SMBI/SEFAZ:**
  - No SMBI, `dataAutoriza` refere-se à liberação interna do pedido (02/09 ou 09/09), enquanto `dataFaturamento` / CT-e é a data real de faturamento/emissão fiscal:
    - **NF-e 913 e 914 / CT-e 856 e 857 (#2068):** `dataFaturamento` = **10/09/2026** (10:12:00 e 10:12:37).
    - **NF-e 893 / CT-e 834 (#5117):** `dataFaturamento` = **04/09/2026** (18:46:42).
  - Corrigido `smbi_espelho_daemon.mjs` para priorizar `m.dataFaturamento` sobre `m.dataAutoriza`.
- **Envio Real Realizado com Sucesso (HTTP 200 / CONFERIDO):**
  - **#5117 (`jlysrq9s9kv4` - Delei T):**
    - Movsai 1035: NF-e 893 (R$ 16.720,00, data 2026-09-04), CT-e 834 (R$ 22.040,00).
    - 38.000 kg (1.520 sc a R$ 11,00), Sal R$ 16.720,00, Comissão 3% (R$ 501,60).
    - Banco Neon: `status = 'faturado'`, `smbi_vinculo_estado = 'CONFERIDO'`.
  - **#2068 (`l853ovpzyzpv` - Big Ben Agro):**
    - Movsais 1050 + 1051: NF-e 913 + 914 (data 2026-09-10), CT-e 856 + 857.
    - 40.000 kg (38 t + 2 t), Sal R$ 9.600,00 (R$ 9.120 + R$ 480), Frete R$ 14.304,00, Comissão 1,5% (R$ 144,00).
    - Banco Neon: `status = 'faturado'`, `smbi_vinculo_estado = 'CONFERIDO'`.

---

## 6. Blindagem Multi-Item e Guarda de Ferramenta Instalada
- **Guarda Anti-Quebra no Daemon:** Adicionada verificação no daemon `smbi_robo_daemon.mjs` (`ferramentaSuportaMultiItem()`). Se a ferramenta em `/home/ubuntu/.openclaw/workspace/tools/smbi_criar_pedido_express.mjs` não possuir `SUPORTA_MULTI_ITEM = true`, qualquer pedido com mais de 1 item é sumariamente recusado com `MAIS_DE_UM_ITEM` / `PENDENTE`, impedindo que o daemon invoque a ferramenta antiga para criar pedidos parciais.
- **Modo de Teste (--parar-antes-de-salvar):** Implementado em `smbi_criar_pedido_express.multi_item.mjs`, permitindo que o formulário seja preenchido e todos os itens inseridos para inspeção sem que `Finaliza` seja acionado.
- **Estado Operacional:** Daemons e serviços 100% desligados. Robô inativo.


