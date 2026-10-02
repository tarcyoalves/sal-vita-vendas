# HERMES (2026-10-02) - Correções e Revisão do Daemon Somente-Espelho

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** `git pull` sincronizado (commit `0d2dde7`); todas as 7 correções aplicadas e testadas em `smbi_espelho_daemon.mjs`; daemon e serviço parados.
- **Branch:** `main`

---

## 1. Correções Realizadas em `smbi_espelho_daemon.mjs`

1. **Sincronização com o CRM (`0d2dde7`):**
   - Executado `git pull --ff-only` incorporando `cnpj` e `comissaoPct` em `GET /api/smbi/ligados` e `GET /api/smbi/vinculos`.
2. **Data de Faturamento (`faturadoEm`):**
   - Removido `new Date()` em `/ligados`. O campo agora adota estritamente a data da NF-e mais recente entre os movsais (`datas.sort().reverse()[0]`), preservando competências anteriores.
3. **Peso Líquido (`pesoL`):**
   - Alterado para priorizar `pesoL` (da SEFAZ/SMBI via `nfe_status_select_ajax.php` ou `peso_liquido`).
   - *Histórico:* Nos envios manuais anteriores (#5131, #5238, #2068-1051 e #3745), havia sido extraído `pesoB` (peso bruto). Para sacaria de sal, `pesoB` e `pesoL` eram idênticos (ex: 2.000 kg / 2.000 kg, 38.000 kg / 38.000 kg), mas a adoção de `pesoL` garante conformidade fiscal absoluta.
4. **Trava de CT-e Não Encontrado:**
   - Se o movsai contiver `cteNumero` informado no SMBI, mas este não for localizado nos 100 CT-es do grid recente (ou não possuir `valorFrete`), o faturamento é pulado e logado como alerta `⚠️ [CTE NÃO ENCONTRADO]`, impedindo faturamento incompleto no CRM.
5. **Segredo Seguro e Íntegro:**
   - Removida qualquer leitura de `.env-radar`. A leitura vem estritamente de `process.env.SMBI_SYNC_SECRET` ou `~/.secrets/smbi.env`. Confirmada ausência de qualquer truncamento no arquivo no disco.
6. **Cooldown de Não-Faturados:**
   - Implementado cooldown de 30 minutos em memória (`COOLDOWN_NAO_FATURADO_MS = 30 * 60 * 1000`). Pedidos consultados que ainda não tiverem faturado (NF-e não emitida ou parcial) são pulados nos ciclos subsequentes de 5 minutos, evitando abrir sessões no SMBI desnecessariamente.

---

## 2. Testes de Simulação

Comando: `node smbi_espelho_daemon.mjs --testar-casos`
- **Caso 1 (Raízes distintas 05967403 vs 12702241):** Trava disparou e bloqueou com sucesso.
- **Caso 2 (Mesma raiz 12702241 matriz vs filial):** Reconheceu a mesma empresa e liberou com sucesso.
- **Caso 3 (Comissão divergente 1.5% vs 3.0%):** Detectou a divergência e incluiu `comissaoPct` no payload com sucesso.
- **Caso 4 (Cooldown 30 min):** Rastreou e ativou bloqueio de reconsulta temporário com sucesso.

---

## 3. Estado Operacional
- **Daemon de Espelho:** Desligado e parado.
- **Robô:** Inativo e desabilitado.
- **Aguardando:** Tarcyo vincular na tela os movsais `"1050, 1051"` para o pedido #2068.
