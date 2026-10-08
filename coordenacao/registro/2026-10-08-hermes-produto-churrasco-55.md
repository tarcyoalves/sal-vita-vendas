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
- Implementação publicada em `origin/main`: `3847bfaaa9bbeccde6ac0c22ce5b10a623f80eb7`.
- Cadastro CRM relido diretamente em transação READ ONLY: uma correspondência exata, nome informado pelo Tarcyo, 25 kg, ativo, sem duplicidade correspondente.
- Ambos os testes novos falharam antes da inclusão e passaram após.
- `npm run check`: passou; `npm test`: 51 arquivos / 652 testes passaram; `npm run build:client`: passou (avisos existentes, sem falha).
- Teste puro do módulo de mapeamento e função real de certeza: passou; 15 testes existentes do robô: passaram.
- CI remoto typecheck-and-tests: success. CRM respondeu HTTP 200.
- Vercel: último status consultado do commit da implementação ainda pending/in_progress. Não afirmar deploy concluído.
- Nenhum pedido criado, nenhum banco alterado, nenhum serviço reiniciado.

## Pendente / status final
**Status: parcial (implementação publicada/testada; ativação operacional pendente).**
Serviço encontrado ativo/enabled, PID 867384 iniciado em 05/10. O processo importa o catálogo uma vez; depende de reinício autorizado pelo Tarcyo para reconhecer 55. Autorização solicitada no chat, ainda não recebida. Confirmar deploy da Vercel ao retomar.

## Armadilhas
Sem `.env`/`.env.local` no repo não significa ausência de conexão CRM: EnvironmentFiles do Radar aponta `/home/ubuntu/.env-radar`. Consultar apenas DATABASE_URL programaticamente, sem imprimir segredo, sob transação READ ONLY. O teste antigo replica um catálogo e não cobre 55; o teste novo exercita código real sem iniciar daemon/rede.
