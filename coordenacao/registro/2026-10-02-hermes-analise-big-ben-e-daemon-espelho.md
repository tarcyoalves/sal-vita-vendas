# HERMES (2026-10-02) - Análise Completa Big Ben (#2068) e Daemon Somente-Espelho

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** Auditoria dos movsais da Big Ben concluída; `smbi_espelho_daemon.mjs` criado, validado e testado em `--simular --once`. Serviços parados.
- **Branch:** `main`

---

## 1. Auditoria Big Ben Agro (#2068 / CNPJ 12.702.241/xxxx)

### A) Relação entre Matriz e Filial
- **Pedido no CRM (#2068):** Cadastrado com CNPJ `12.702.241/0001-61` (Matriz - Cariacica/ES), 40.000 kg (40 t) de sal e Sal Total de R$ 9.600,00.
- **Movsai 1051 (Filial 0002):** Faturado para `12.702.241/0002-42` (Filial 0002 - Shopping Rural / Cariacica/ES). Trata-se da **mesma compradora** (Big Ben Agro LTDA), mas em estabelecimento filial.

### B) Rastreamento dos Movsais no SMBI (Os 40.000 kg encontrados)
Varredura completa em `movsai_select_ajax.php` localizou exatamente os dois movsais que compõem a carga total de 40 toneladas:

1. **Movsai 1050 (Matriz `12.702.241/0001-61`):**
   - **Itens:**
     - 1.200 sacos de `SAL DO FAZENDEIRO TRITURADO 25 KG` (30.000 kg = 30 t) a R$ 6,00 = R$ 7.200,00.
     - 320 sacos de `SAL DO FAZENDEIRO MOIDO 25 KG` (8.000 kg = 8 t) a R$ 6,00 = R$ 1.920,00.
   - **Peso:** 38.000 kg (38 Toneladas).
   - **Valor Sal:** R$ 9.120,00.
   - **NF-e:** `913` (Aprovada status 100, emissão `10/09/2026`).
   - **CT-e:** `856` (Aprovado status 100, frete R$ 13.588,80, R$ 357,60/t sobre 38 t).
   - **Comissão:** 1,50% (R$ 136,80).

2. **Movsai 1051 (Filial `12.702.241/0002-42`):**
   - **Itens:**
     - 80 sacos de `SAL DO FAZENDEIRO MOIDO 25 KG` (2.000 kg = 2 t) a R$ 6,00 = R$ 480,00.
   - **Peso:** 2.000 kg (2 Toneladas).
   - **Valor Sal:** R$ 480,00.
   - **NF-e:** `914` (Aprovada status 100, emissão `10/09/2026`).
   - **CT-e:** `857` (Aprovado status 100, frete R$ 715,20, R$ 357,60/t sobre 2 t).
   - **Comissão:** 1,50% (R$ 7,20).

**Total Consolidado (1050 + 1051):**
- Triturado: 1.200 sacos (30 t) = R$ 7.200,00.
- Moído: 320 + 80 = 400 sacos (10 t) = R$ 2.400,00.
- **Soma:** 1.600 sacos = **40.000 kg (40 t) = R$ 9.600,00**, batendo 100% com o pedido #2068!
- **Conclusão Operacional:** O faturamento foi dividido em 2 notas fiscais porque uma parcela de 2 toneladas foi entregue/faturada para a filial 0002 e 38 toneladas para a matriz 0001. Para espelhar a totalidade, o vínculo na tela do CRM deveria contemplar ambos os movsais (`1050, 1051`).

---

## 2. Daemon de Espelhamento (`smbi_espelho_daemon.mjs`)

- **Arquivo:** `/home/ubuntu/.openclaw/workspace/smbi-robo/smbi_espelho_daemon.mjs`
- **Condições Atendidas:**
  1. Intervalo configurável (padrão: 5 min).
  2. Só abre sessão no SMBI se `GET /api/smbi/vinculos` ou `GET /api/smbi/ligados` trouxerem itens pendentes (sessão poupada quando vazios).
  3. Trava de CNPJ: Se o CNPJ (14 dígitos) do movsai diferir do pedido, pula imediatamente o envio e emite alerta de log `⛔ [DIVERGÊNCIA CNPJ]`.
  4. Múltiplos movsais: Só envia faturamento se todos os movsais do pedido estiverem faturados com NF-e status 100.
  5. Atualização de comissão: Envia `comissaoPct` somente se o percentual do SMBI for diferente do CRM.
  6. **Prova de Inocuidade:** `grep -Ei "criar|insert|_insert|SCRIPT_CRIAR|venda_resumida" smbi_espelho_daemon.mjs` retorna 0 linhas.
  7. **Teste em `--simular --once`:** Executado com sucesso sem erros.
