# HERMES (2026-10-01) - Robô SMBI: Ajustes de Faturamento, Limpeza e Trava de Multi-Movsais

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-01
- **Status:** Concluído (Ajustes da Etapa 2 aplicados, registro limpo, serviço parado)
- **Branch:** `main`

## O que foi verificado (com evidências)

1. **Auditoria Read-Only no SMBI dos 6 pedidos legados:**
   - Consulta via `movsai_select_ajax.php` no SMBI:
     - `1108`: inexistente/excluído (retorno nulo)
     - `1109`: inexistente/excluído (retorno nulo)
     - `1110`: inexistente/excluído (retorno nulo)
     - `1111`: inexistente/excluído (retorno nulo)
     - `1112`: inexistente/excluído (retorno nulo)
     - `1113`: inexistente/excluído (retorno nulo)
     - `1115`: inexistente/excluído (retorno nulo)
   - Limpeza realizada em `smbi_robo_enviados.json` removendo todas as chaves desses movsais cancelados/excluídos.

2. **Auditoria de Pedidos com Múltiplos Movsais no CRM:**
   - Varredura SQL na tabela `fat_orders`: zero pedidos atualmente com vírgula em `smbi_movsai_id` ou mais de 1 movsai em `smbi_vinculo_movsais` / `smbi_espelho_fiscal`.
   - Carga fracionada recente (Fabiana Casavechia) foi dividida em dois pedidos CRM distintos (`zpxqv3air93z` para 37 t faturadas e `ir2zcck1prd2` para 2 t faturadas de excesso).
   - Atualizado repo com commit `6d04987` (`git pull --ff-only`).
   - Implementada trava no `smbi_robo_daemon.mjs`: se um pedido tiver N movsais vinculados, o robô só envia a Rota 3 (`POST /api/smbi/pedidos/:id/faturamento`) quando **TODOS** os N movsais estiverem autorizados com NF-e status 100, incluindo o `pesoKg` de cada um no array `movsais`.

3. **Marcação de 1116 e 1117 no Registro Local:**
   - Gravado em `/home/ubuntu/.openclaw/workspace/data/smbi_robo_enviados.json`:
     - `zpxqv3air93z` (1116): `faturado: true`, NF-e 967, CT-e 907.
     - `ir2zcck1prd2` (1117): `faturado: true`, NF-e 968, CT-e 908.
     - `hq7ra5rce4pb` (1071): `faturado: true`, NF-e 944, CT-e 884.
   - Ambos protegidos contra reenvio.

4. **Frequência e Economia de Sessão SMBI:**
   - Faturamento configurado com intervalo de 20 minutos (`INTERVALO_FATURAMENTO_MS = 20 * 60 * 1000`).
   - Trava prévia no daemon: se não houver pedidos vinculados pendentes de faturamento (`pendentes.length === 0`), a função retorna imediatamente sem abrir navegador Playwright e sem fazer login no SMBI.

5. **Estado dos Serviços e Travas:**
   - `smbi-crm-sync.service` parado e desabilitado no systemd user (`inactive`, `disabled`).
   - `roboAtivo` permanece `false` no CRM.
   - Teste de simulação (`--simular`) executado em < 1 segundo com saída limpa (`0 criados`, `0 checagens fiscais pendentes`).

## O que NÃO foi verificado
- Criação real de pedidos no SMBI (aguardando Tarcyo clicar em "Enviar para SMBI" em pedido de 1 item e avisar para rodar piloto com `--max-criar 1`).
- Envio real de faturamento para pedido multi-movsai (atualmente não há nenhum pedido multi-movsai pendente no sistema).

## Simulação Final Pré-Piloto (Registro Limpo)
- Executado `node smbi_robo_daemon.mjs --simular` às 16:54 BRT:
  - Saída: `0 recebido(s); criaria 0 []; pularia 0 []`.
  - Faturamento: `nenhum pedido vinculado pendente de conferência fiscal`.
  - Duração: 1.1s, zero navegadores/sessões abertas no SMBI.
- Status do piloto:
  - `smbi-crm-sync.service` inativo e desabilitado (`inactive`, `disabled`).
  - `roboAtivo` desligado (`false`).
  - Protocolo alinhado: aguardar o aviso do Tarcyo ("clique feito no pedido X") -> rodar `--simular` e mostrar que somente ele entra -> esperar Tarcyo ligar `roboAtivo` no CRM -> rodar `--max-criar 1` -> auditar diretamente no SMBI e reportar evidências.
