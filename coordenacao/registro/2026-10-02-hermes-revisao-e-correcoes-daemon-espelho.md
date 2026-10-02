# HERMES (2026-10-02) - Correções e Revisão do Daemon Somente-Espelho

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** Simulação realizada para os 3 vínculos pendentes em `/api/smbi/vinculos` (#5156, #5225 e Ruralshop); cálculo de frete corrigido; conciliação de setembro da Analice mapeada e aprovada; aguardando OK para envio real.
- **Branch:** `main`

---

## 1. Correções Realizadas em `smbi_espelho_daemon.mjs`

1. **Sincronização com o CRM (`0d2dde7`):**
   - Executado `git pull --ff-only` incorporando `cnpj` e `comissaoPct` em `GET /api/smbi/ligados` e `GET /api/smbi/vinculos`.
2. **Data de Faturamento (`faturadoEm`):**
   - Removido `new Date()` em `/ligados`. O campo agora adota estritamente a data da NF-e mais recente entre os movsais (`datas.sort().reverse()[0]`), preservando competências anteriores.
3. **Peso Líquido (`pesoL`) e Log de Fallback:**
   - Alterado para priorizar `pesoL` (da SEFAZ/SMBI via `nfe_status_select_ajax.php` ou `peso_liquido`).
   - Se `pesoL` estiver ausente na SEFAZ e no SMBI, faz fallback para `pesoB` registrando aviso explícito no log (`⚠️ [AVISO PESO]`).
4. **Trava de Frete e CT-e Ausente:**
   - Campos no SMBI que definem ausência de frete: `tipo_venda === 'FOB'`, `modFrete === '9'` (sem frete) e `frete_cliente === 0` / `frete === 0`.
   - Se a operação possui frete (`FOB_ESPECIAL` / `CIF` com `frete_cliente > 0`) e o `cteNumero` ainda não foi emitido no SMBI, o daemon **não envia o faturamento**, entra em cooldown de 30 min e aguarda a emissão do CT-e para não enviar faturamento incompleto.
   - Se o `cteNumero` existe mas não está nos 100 CT-es recentes do grid, pula e loga `⚠️ [CTE NÃO ENCONTRADO]`.
   - Corrigida extração do valor do frete do grid de CT-e (lendo do hidden input `valor_selecionados_total` em vez do parse que truncava o milhar).
5. **Cooldown de 30 min em `/ligados` e `/vinculos`:**
   - Aplicado cooldown de 30 minutos em memória para ambas as filas (`/ligados` e `/vinculos`) quando o pedido/movsai não estiver faturado ou sem CT-e. A primeira checagem após o vínculo continua imediata.
6. **Segredo Seguro e Íntegro:**
   - Removida qualquer leitura de `.env-radar`. A leitura vem estritamente de `process.env.SMBI_SYNC_SECRET` ou `~/.secrets/smbi.env`. Confirmada ausência de qualquer truncamento no arquivo no disco.

---

## 2. Simulação dos Vínculos Manuais em `/api/smbi/vinculos`

Comando: `node smbi_espelho_daemon.mjs --simular --once`

1. **Pedido `k91kcfmczgnt` (#5156 - K de Oliveira B LTDA / TO):**
   - Movsai 1022: NF-e 878 (2026-09-01), Sal R$ 4.200,00, Peso Líquido 17.500 kg, CT-e 822 (frete R$ 5.740,00).
2. **Pedido `tt2dmvss39gt` (#5225 - Rudimar Moccellin / MS):**
   - Movsai 991: NF-e 883 (2026-09-02), Sal R$ 7.680,00, Peso Líquido 32.000 kg, CT-e 826 (frete R$ 15.872,00).
3. **Pedido `xb7kn5vje1zn` (Ruralshop Campo Grande / MS):**
   - Movsai 990: NF-e 884 (2026-09-02), Sal R$ 1.440,00, Peso Líquido 6.000 kg, CT-e 827 (frete R$ 3.033,60).

---

## 3. Reconciliação Consolidada de Setembro/2026 (Analice)

Valores projetados após os 3 ajustes acordados:
- **Sal Faturado:** **R$ 56.026,70** (SMBI: R$ 55.546,70 + R$ 480,00 Juliana = R$ 56.026,70 | CRM: R$ 57.626,70 - R$ 2.480,00 Delei + R$ 880,00 TS = R$ 56.026,70)
- **Peso Líquido:** **193,25 t** (SMBI: 191,25 t + 2,00 t Juliana = 193,25 t | CRM: 193,25 t - 2,00 t + 2,00 t = 193,25 t)
- **Comissão (3%):** **R$ 1.785,80** (SMBI: R$ 1.771,40 + R$ 14,40 Juliana = R$ 1.785,80 | CRM: R$ 1.833,80 - R$ 74,40 + R$ 26,40 = R$ 1.785,80)

Fechamento 100% conciliado entre os dois sistemas no mesmo centavo.

---

## 4. Estado Operacional
- **Daemon de Espelho:** Desligado e parado.
- **Robô:** Inativo e desabilitado.
- **Aguardando:** OK do Tarcyo para envio real dos vínculos simulados, e a inclusão/ajuste dos demais itens (1117, 1035 e 1036).
