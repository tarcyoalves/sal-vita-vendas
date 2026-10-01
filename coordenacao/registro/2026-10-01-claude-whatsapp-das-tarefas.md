# WhatsApp que não aparecia nas tarefas (lembretes) e no Buscador

- **Agente:** claude
- **Início:** 2026-10-01
- **Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## Causa

1. `tasks.list` **não traz `notes`** (para reduzir o payload), e a tela de Tarefas só procurava o telefone em `título + anotações`, ignorando a coluna `tasks.phone`. O botão de WhatsApp, o ícone verde de telefone e o filtro "WhatsApp" dependiam disso.
2. A coluna `tasks.phone` só era preenchida na criação e na importação: quem digitava o número depois (título/anotações) ficava sem ela. `tasks.update` nunca a atualizava.
3. O Buscador (carteira e "já no CRM") usava só a coluna `phone`, então herdava as duas falhas.

## Correção

- `shared/phone.ts`: `phoneOfTask` = coluna válida, senão primeiro telefone achado no título/anotações; `normalizeBrPhone` (tira máscara e DDI 55). Sem lookbehind (Safari antigo).
- `Tasks.tsx`: botão WhatsApp/Ligar, ícone e filtro usam `phoneOfTask`.
- `tasks.update`: se título ou anotações mudam e a coluna está vazia, preenche `phone`.
- `prospectingRadar`: carteira, pedido→tarefa por CNPJ e `taskPhone` usam `phoneOfTask`.
- `tests/phone-of-task.test.ts`.

## Verificado

`npm run check`, `npx vitest run` (341 testes), builds. Não visto no navegador. Não foi feita migração de dados (a leitura já cai para título/anotações); a coluna se completa conforme as tarefas são editadas.
