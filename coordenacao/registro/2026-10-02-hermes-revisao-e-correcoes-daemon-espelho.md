# HERMES (2026-10-02) - Correções e Revisão do Daemon Somente-Espelho

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** `git pull` sincronizado (commit `0d2dde7`); todas as correções aplicadas e testadas unitariamente em `smbi_espelho_daemon.mjs`; daemon e serviço parados.
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
5. **Cooldown de 30 min em `/ligados` e `/vinculos`:**
   - Aplicado cooldown de 30 minutos em memória para ambas as filas (`/ligados` e `/vinculos`) quando o pedido/movsai não estiver faturado ou sem CT-e. A primeira checagem após o vínculo continua imediata.
6. **Segredo Seguro e Íntegro:**
   - Removida qualquer leitura de `.env-radar`. A leitura vem estritamente de `process.env.SMBI_SYNC_SECRET` ou `~/.secrets/smbi.env`. Confirmada ausência de qualquer truncamento no arquivo no disco.

---

## 2. Testes de Simulação (`--testar-casos`)

Comando: `node smbi_espelho_daemon.mjs --testar-casos`
- **Caso 1 (Raízes distintas 05967403 vs 12702241):** Trava disparou e bloqueou com sucesso.
- **Caso 2 (Mesma raiz 12702241 matriz vs filial):** Reconheceu a mesma empresa e liberou com sucesso.
- **Caso 3 (Comissão divergente 1.5% vs 3.0%):** Detectou a divergência e incluiu `comissaoPct` no payload com sucesso.
- **Caso 4 (Cooldown 30 min em ambas as filas):** Rastreou e ativou bloqueio de reconsulta temporário com sucesso.
- **Caso 5 (FOB_ESPECIAL com frete e sem CT-e emitido):** Trava disparou e bloqueou faturamento prematuro com sucesso.

---

## 3. Estado Operacional
- **Daemon de Espelho:** Desligado e parado.
- **Robô:** Inativo e desabilitado.
- **Aguardando:** Tarcyo vincular na tela os movsais `"1050, 1051"` para o pedido #2068.
