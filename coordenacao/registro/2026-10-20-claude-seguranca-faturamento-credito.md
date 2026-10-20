# Correções de segurança e faturamento/crédito (lotes 1 e 2)

- **Agente:** claude
- **Início:** 2026-10-20
- **Status:** concluído (branch local, sem push)
- **Branch:** `worktree-agent-a6e9e1430a55f8044` (sem push; main intocada)

## Objetivo

Lote 1 (segurança): bypass de crédito por tarefa/CNPJ, knowledge staff-only, confirmação
server-side na IA, rate limit de reset de senha, mySellerId nulo, senha mínima 10, logs seguros.
Lote 2: robô SMBI x upsert de pedido, PED-n, crédito (veredito, cobrança incerta), fuso horário.

## Arquivos e áreas que vou tocar

- `server/routers/credito.ts`, `server/lib/credito/**`, `server/routers/knowledge.ts`
- `server/routers/ai.ts`, `server/routers/auth.ts`, `server/lib/trpcBatchGuard.ts`
- `server/routers/faturamento.ts`, `server/pdf/pedidoPdf.tsx`
- `server/routers/tasks.ts` (somente `tasks.create`/validação de documento)
- `api/index.ts` (somente o app.use do rate limit de auth), `api/bundle.js`
- `server/smbiRoutes.ts`, `server/smbiCadastroRoutes.ts` (somente trocar o log do console.error)

**Não vou tocar em:** loja Premium, extensoes/, sallog/, lógica das rotas SMBI, db-health.

## Resultado

- Crédito: atendente só vê documento de pedido dele ou de tarefa anterior à 1ª consulta; `tasks.create` valida CNPJ/CPF.
- `knowledge.create/delete` só staff; `reschedule_tasks` da IA exige token HMAC do servidor (5 min, só aquele lote, só em outra requisição); conteúdo da base marcado como dado não confiável.
- Reset de senha com limiter por IP que conta também respostas 200 e tempo mínimo de 1,5 s; senha nova mínima de 10.
- `mySellerId` nulo não é mais dono de pedido sem vendedor.
- `upsertPedido`: colunas do robô fora do `set`; pedido existente faz UPDATE (PED-n não pula).
- Crédito: veredito = mais recente por produto, depois o pior; trava de 10 min após cobrança incerta; quedas de rede marcam cobrança incerta; datas em America/Fortaleza.

## Armadilhas encontradas

- `authIpLimiter` tem `skipSuccessfulRequests: true`: no reset de senha (sempre 200) nunca contaria. Criado `resetIpLimiter`.
- `ai.bulkReschedule` (botão do painel do atendente) nunca executou: sempre cai em simulação e a tela mostra "Concluído.". Não alterado.
- O `set` do upsert agora vive em `server/lib/pedidoUpsert.ts`; o teste `smbi-envio-multiempresa` foi ajustado para ler de lá.

## Não verificado

Nada rodou contra banco real nem em produção: SQL do crédito (`min(consultado_em)`), UPDATE do upsert e os limiters foram checados por tipos e testes de função pura/código-fonte.
