# Vínculo CRM → SMBI: Sal Churrasco com Iodo Vita 25 kg

- Agente: Hermes
- Início: 2026-10-08
- Branch: main
- Status: em andamento
- Pedido: Tarcyo solicitou vincular SAL CHURRASCO COM IODO VITA 25 KG ao código SMBI 55.

## Arquivos e áreas
- client/src/lib/faturamento/smbiCatalog.ts
- tests/smbi-produto55.test.ts
- docs/INTEGRACAO-SMBI.md
- ESTADO-DO-PROJETO.md
- HANDOFF-HERMES.md
- Esta reivindicação e seu registro final.
- Fora do repo, integração local: /home/ubuntu/.openclaw/workspace/smbi-robo/smbi_sync_crm_pedidos.mjs e test_produto55_robo.mjs.

## Limites
Somente adicionar de-para confirmado pelo Tarcyo e testes. Sem banco/esquema, sem criar pedidos, sem alterar outros produtos, sem reiniciar serviços. Cadastro CRM será conferido somente por leitura.

## Verificação
Pendente: teste falhando antes da inclusão, teste verde após inclusão, typecheck, suíte, build, estado publicado e catálogo local do robô. Serviço encontrado ativo/enabled; reinício para carregar catálogo novo exige autorização separada do Tarcyo.
