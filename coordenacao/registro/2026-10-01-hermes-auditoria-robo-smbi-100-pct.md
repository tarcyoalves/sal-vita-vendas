# HERMES (2026-10-01) - Auditoria Completa e Homologação do Robô SMBI (v3.0.0)

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-01
- **Status:** Robô 100% auditado e funcional / Serviço systemd mantido inativo aguardando autorização de religamento
- **Branch:** `main`

## Itens Auditados e Validados (com Evidências)

1. **Credenciais e Segurança:**
   - `SMBI_SYNC_SECRET` em `/home/ubuntu/.secrets/smbi.env` (600, 64 caracteres, presente e válido).
   - Proteção de log: tokens nunca expostos em saídas ou headers.
   - Tratamento de erro 401 (`pararPor401`) e 409 sem repetição em loop.

2. **Endpoints da API do CRM (`https://lembretes.salvitarn.com.br`):**
   - `GET /api/smbi/pedidos`: HTTP 200 OK (`roboAtivo: true`, 0 pedidos para criar).
   - `POST /api/smbi/heartbeat`: HTTP 200 OK (aceito, ciclo e métricas registrados).
   - `GET /api/smbi/ligados`: HTTP 200 OK (2 pedidos mapeados).
   - `GET /api/smbi/vinculos`: HTTP 200 OK.
   - `POST /api/smbi/pedidos/:id/retorno`: validado nas etapas anteriores.
   - `POST /api/smbi/pedidos/:id/faturamento`: validado com espelho de NF-e/CT-e.

3. **Melhorias Aplicadas no Robô:**
   - Integrado `GET /api/smbi/ligados` como fonte primária da verdade na verificação de faturamento (`verificarFaturamentoLigados`), cobrindo tanto pedidos criados pelo robô quanto vínculos feitos na tela.
   - Normalização estrita de datas (`normDataIso`) para evitar rejeições de formato em `nfe.data`.
   - Ajustada busca direta no catálogo `SMBI_PRODUTOS_CATALOGO` por `p.descricao || p.nome`.

4. **Travas Operacionais Mantidas:**
   - Trava de ciclo único (`cicloEmAndamento`).
   - Corte de pedidos legados e marco temporal da prova do clique (`corte.json`).
   - Re-checagem obrigatória com `reservaToken` no CRM.
   - Busca prévia da marca `CRM:<id>` no SMBI antes de criar.
   - Dry-run de conferência cadastral no SMBI antes da gravação real.
   - Releitura do pedido criado no SMBI com conferência campo a campo antes de emitir o estado `CRIADO`.

5. **Execução de Homologação:**
   - `smbi_robo_daemon.mjs --simular --once`: executou de ponta a ponta sem erros.
   - `smbi_robo_daemon.mjs --simular --checar-faturamento`: varreu os pedidos ligados sem divergências.
   - `smbi-crm-sync.service`: inativo e desabilitado.
