# Bloqueados: arquivar e EXCLUIR (tarefas, clientes, contatos de marketing)

- **Agente:** claude
- **Início:** 2026-09-30
- **Fim:** 2026-09-30
- **Status:** concluído e conferido no log (f9e7224 e 66cbe56)
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

## Verificado (log do build de produção)

- Excluídas e arquivadas **33 tarefas** (nenhuma convertida nem com pedido): salmaranata.com.br 10,
  gruposmabrasil.com.br 8, gmail.com 4, salina.com.br 3, sal.com 2, salminas.com.br 2, finosal.com.br 2,
  grupososal.com.br 1, outlook.com 1. Os 5 de gmail/outlook casaram pela palavra "salinas".
- Clientes e contatos de marketing: 0. 14 endereços novos na lista "Bloqueados" (`dominio_bloqueado`).
- Execuções seguintes do mesmo build: 0 (idempotente); arquivo com 33 registros.
- **Anomalia:** os e-mails de gruposmabrasil e dos domínios de sal já haviam sido esvaziados no deploy
  anterior e **reapareceram** antes deste deploy. Algo (importação, edição com dados antigos ou
  sincronização externa) os recoloca. Não identificado. A exclusão registra as tarefas em
  `task_deletion_logs`, então reimportação pelo CRM (CNPJ/telefone) é detectada.
- Correção: a leitura anterior de "0 para salinas" veio da última de 3 execuções repetidas do build
  (as anteriores já limpam); não valia como prova de inexistência.
- Relatório "CANDIDATAS" (12) são leads na cidade de Salinas (MG); nada foi excluído por isso.
