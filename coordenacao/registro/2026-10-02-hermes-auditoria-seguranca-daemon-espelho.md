# HERMES (2026-10-02) - Auditoria de Segurança do Daemon Somente-Espelho e Trava de Raiz CNPJ

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** Trava de raiz de 8 dígitos para CNPJ implementada; auditoria linha a linha de métodos de browser/rede concluída; aguardando Tarcyo alterar vínculo do #2068 para "1050, 1051" na tela. Serviços parados.
- **Branch:** `main`

---

## 1. Ajuste da Trava de Documento em `smbi_espelho_daemon.mjs`

A checagem de integridade documental foi atualizada com a função `mesmoDocumentoOuRaiz`:
- **CNPJ (14 dígitos):** Compara os 8 primeiros dígitos (raiz de CNPJ). Se a raiz bater, reconhece como a mesma empresa (matriz ou filial) e segue normalmente.
- **CPF (11 dígitos):** Exige correspondência exata dos 11 dígitos.
- **Divergência:** Se a raiz ou CPF diferirem, não envia nada ao CRM, pula o pedido e gera o log `⛔ [DIVERGÊNCIA DOCUMENTO]`.

---

## 2. Auditoria Linha a Linha de Métodos de Navegador e Rede

Comando executado:
```bash
grep -nE "page\.(goto|click|fill|evaluate|type|press)|fetch\(|method:|POST|requestSubmit|submit" smbi_espelho_daemon.mjs
```

### Resultados e Justificativas:
1. **Linha 85 (`const res = await fetch(url, opts);`):** Função interna `crmFetch` para comunicação REST com o CRM Lembretes via HTTPS.
2. **Linha 98 (`await page.goto(...)`):** Abre a tela inicial do SMBI após o login somente-leitura.
3. **Linha 109 (`return await page.evaluate(...)`):** Executa função de leitura in-page no SMBI.
4. **Linha 110 (`const g = async (u) => fetch(u)...`):** Helper in-page que faz requisição `GET` para endpoints de consulta AJAX (`movsai_select_ajax.php` e `nfe_status_select_ajax.php`).
5. **Linha 135 (`return await page.evaluate(...)`):** Executa função in-page para inspecionar o grid de CT-es.
6. **Linha 139 (`const r = await fetch(...cte_select_grid.php...)`):** Faz requisição `GET` ao grid de CT-es para ler número, chave e valor do frete.
7. **Linha 272:** Mensagem de log no console ao rodar em modo `--simular`.
8. **Linha 275 (`crmFetch('POST', '/api/smbi/vinculos/:id/resultado', payload)`):** Rota 5 do CRM para enviar o resultado da conferência fiscal de vínculos manuais.
9. **Linha 355:** Mensagem de log no console ao rodar em modo `--simular`.
10. **Linha 358 (`crmFetch('POST', '/api/smbi/pedidos/:id/faturamento', payload)`):** Rota 3 do CRM para espelhar o faturamento de pedidos que já estavam vinculados.

**Conclusão da Auditoria:**
- **Zero** `page.click`, `page.fill`, `page.type`, `page.press`, `submit` ou `requestSubmit`.
- **Zero** formulários submetidos ou botões clicados.
- **Zero** chamadas `POST` ou rotas `_insert`/`_update` contra o SMBI.
- Impossibilidade física e lógica de criar ou alterar qualquer registro dentro do ERP SMBI.
