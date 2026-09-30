# Bloqueados: arquivar e EXCLUIR (tarefas, clientes, contatos de marketing)

- **Agente:** claude
- **Início:** 2026-09-30
- **Fim:** 2026-09-30
- **Status:** concluído no código; aguardando conferir o log do deploy
- **Branch:** `main`

## Objetivo

Pedido do dono: excluir da base e das tarefas o que é de domínio bloqueado, mantendo um registro
como bloqueado.

## Arquivos tocados

- `server/db/schema.ts`, `server/db/migrate.ts` (`SCHEMA_VERSION 2026-09-29e`), `tests/schema-version.lock.json`: tabela `blocked_contacts`
- `scripts/purge-blocked-emails.ts`: arquivar e excluir; relatório de candidatas
- `server/lib/radar/receitaParse.ts`: o importador do Radar nunca carrega e-mail bloqueado

## Resultado

- Tarefa (não convertida e sem pedido), cliente sem tarefa e contato de marketing com e-mail bloqueado
  são gravados em `blocked_contacts` (nome, telefone, CNPJ, atendente, notas) e **excluídos**, numa
  única instrução (se o arquivo falhar, nada é apagado).
- Tarefa excluída entra em `task_deletion_logs` (o lead não volta por importação/Radar).
- O e-mail vai para a lista "Bloqueados" do E-mail Marketing (`email_suppressions`, motivo `dominio_bloqueado`).
- Tarefa convertida ou com pedido NÃO é excluída (só contada no log).

## Verificado

`npm run check` 0 erros; testes e builds ok localmente. O SQL novo não rodou contra banco antes do deploy.

## Não verificado / pendente

- Tarefas que já tiveram o e-mail esvaziado na limpeza anterior não têm mais o e-mail: o log lista
  "CANDIDATAS" para o dono conferir; nada foi excluído por palpite.
- Não há tela para ver `blocked_contacts` (só consulta no banco); os e-mails aparecem em "Bloqueados".
