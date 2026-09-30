# Buscador de Clientes: novo nome, botão "Ir para a tarefa" e WhatsApp nos cartões

- **Agente:** claude
- **Início:** 2026-09-30
- **Fim:** 2026-09-30
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## O que mudou

- "Radar de Cargas" passou a se chamar **Buscador de Clientes** na tela (menu, título, texto de "em implantação"). A rota `/radar-cargas` continua a mesma.
- Botão **Ir para a tarefa #ID** nos cartões da busca (lead que já é tarefa) e da carteira. Leva a `/tasks?tarefa=ID`; `Tasks.tsx` abre a edição dessa tarefa e limpa o parâmetro. Atendente só vê o botão nas tarefas que são dele.
- **WhatsApp ausente em vários cartões:**
  1. Lead já no CRM escondia todos os botões de contato. Agora mostra WhatsApp e Ligar (sem registrar novo contato do Buscador), usando o telefone da tarefa (`crm.taskPhone`) e os da Receita.
  2. Na carteira, o cliente vindo de pedido não tinha telefone (`fat_orders` não guarda). Agora o servidor busca telefone e tarefa pela tarefa de mesmo CNPJ, e `consolidarCarteira` compartilha telefone entre registros do mesmo nome e cidade.

## Como verificar

`npm run check`, `npx vitest run` (318 testes), builds do client e da API. Não foi visto no navegador.
