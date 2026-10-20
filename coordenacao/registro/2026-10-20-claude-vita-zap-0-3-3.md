# Vita Zap 0.3.3: fila editável na aba Envio

- **Agente:** claude
- **Início:** 2026-10-20
- **Fim:** 2026-10-20
- **Status:** concluído (commit no branch, sem push)
- **Branch:** `worktree-agent-a7b78127568c18d92`

## Objetivo

Pedido do dono: durante a execução (manual ou automática) mostrar a fila dos próximos contatos
como na Prévia, com edição do primeiro nome e do texto, remover, reordenar e "Enviar este a seguir".

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/` (campanha, executor, painel Envio, testes, README, versão 0.3.3)

**Não vou tocar em:** o CRM (raiz), `src/content/`, regras de envio.

## Resultado

Componente "Próximos (N)" e "Concluídos (N)" na aba Envio; item em andamento travado; edições
gravadas no IndexedDB na hora; executor relê a fila antes de abrir cada contato.

## Verificado

- `npx tsc --noEmit -p .` e `npm test` em `extensoes/vita-zap`

## Não verificado / pendente

- Interface no Chrome com o WhatsApp Web de verdade.

## Armadilhas encontradas

- `passo()` do executor guardava a campanha em variável local antes de vários `await`; edição feita
  nesse intervalo seria sobrescrita. Agora ele relê `this.estado.campanha` após as esperas.
