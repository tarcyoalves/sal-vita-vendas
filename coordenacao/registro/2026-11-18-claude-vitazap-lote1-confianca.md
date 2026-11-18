# Vita Zap 0.7.59, lote 1: segurança e confiança nos automáticos

- **Agente:** claude
- **Início:** 2026-11-18
- **Fim:** 2026-11-18
- **Status:** parcial (servidor em `main`; extensão 0.7.59 só na branch, não publicada no site)
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só os commits do servidor vão para `main`

## Objetivo

Pedido do dono (análise crítica da extensão, lote 1): (1) modo Observação + placar de acerto da IA antes de ligar o envio automático;
(2) reler a conversa antes de cada envio automático; (3) prioridade e previsão da fila com o teto compartilhado; (4) aviso de histórico
do WhatsApp Web sumindo; (5) registro "O que a IA fez" com Desfazer; (6) reserva da IA (log da cadeia inteira falhando). Nada de função
nova fora desta lista. Esta publicação também fechou a reivindicação antiga do ajuste "{nome} opcional" (18/11), com autorização do dono.

## Arquivos e áreas que toquei

- Servidor (em `main`): `server/lib/llm.ts`, `server/routers/zapCrm.ts`, `server/lib/zapAgendamentos.ts`, `tests/llm-chain.test.ts`, `tests/zap-crm.test.ts`. Sem tabela nem coluna nova (sem SCHEMA_VERSION).
- Extensão (só na branch): `extensoes/vita-zap/src/` (shared: `automaticos.ts`, `reler-antes.ts`, `fila.ts`, `historico-sumindo.ts` novos; `banco.ts`, `followup.ts`, `reativacao.ts`, `leads.ts`, `servico-*.ts`, `constantes.ts`; sidepanel: `Automaticos.tsx`, `automaticos-motor.ts`, `registro-ia.ts` novos; `executor.ts`, `followup-motor.ts`, `reativacao-motor.ts`, `Followup.tsx`, `Reativacao.tsx`, `App.tsx`; background: `historico.ts` novo, `service-worker.ts`), testes, versão 0.7.59.
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md` (seção 13), `extensoes/vita-zap/README.md` (3.7), `ESTADO-DO-PROJETO.md`.

## Progresso

- [x] servidor: llm.ts (log único), `zapCrm.desfazerAgendamento`
- [x] extensão: observação + placar, releitura antes de enviar, fila, aviso do histórico, registro/desfazer
- [x] docs, testes, Chromium real, zip local `/home/user/vita-zap-0.7.59-local.zip` (sem `npm run publicar`)

## Resultado

Aba **Automáticos** (modo Desligado | Observação | Ligado para cobrança e reativação; placar; "o que a IA faria" com Acertou/Errou; fila de hoje;
"O que a IA fez" com Desfazer). Quem estava ligado cai para Observação. Executor relê a conversa antes de cada envio automático e confere o modo
gravado. Aviso diário do histórico sumindo no service worker (sem permissão nova). IndexedDB v4 (lojas aditivas `julgamentos` e `acoesIa`).

## Commits

- main: `e09f971` claim (e fechamento do claim antigo do `{nome}`), `12f4f10` llm log da cadeia inteira, `3c2e82d` `zapCrm.desfazerAgendamento`.
- branch `claude/magical-fermi-wrdxjy`: os mesmos (cherry-pick) + commit da extensão 0.7.59 + este registro.

## Verificado

- Servidor, em worktree de `origin/main` com `ANTIGRAVITY02_*`/`GROQ_API_KEY` simuladas: `npm run check` 0 erros; `npx vitest run` 125 arquivos, 1799 testes.
- Extensão: `tsc` e `npm run build` ok; `npm test` 1330 passando e só `tests/publicacao.test.ts` falhando (pré-existente: o site publica a 0.7.46).
  Testes novos: regras (32), banco v4 + modo + desfazer (13), painel Automáticos (11), aviso do histórico (11), arquitetura (12), releitura/observação nos motores (22).
- Chromium real com a extensão construída (`e2e/run-observacao.cjs`, WhatsApp falso e CRM falso): 21/21 (banco v3 para v4 sem perda, quem estava ligado cai para
  Observação, "Ligado" bloqueado com "Faltam 30", reativação em Observação sem nada no CRM nem no WhatsApp, julgamentos, placar, Desfazer chamando o CRM, confirmação do risco).

## Não verificado / pendente

- WhatsApp Web REAL (releitura antes do envio, seletores), IA real, o disparo real do alarme/notificação do histórico no Chrome, o Desfazer contra o CRM em produção (deploy do servidor não conferido aqui),
  envio automático real pelo Executor com a releitura (só nos testes com Executor real e no WhatsApp falso).
- `npm run publicar` NÃO feito (aprovação do dono pendente).
- `GROQ_MODEL`/`NVIDIA_MODEL` apontarem para modelos vigentes: documentado, mas os padrões do código não foram trocados (não há como verificar o nome vigente daqui).

## Armadilhas encontradas

- `idb` + IndexedDB: um teste que apaga/recria o banco precisa de uma página SEM o app aberto (o painel segura uma conexão e o `deleteDatabase` fica pendurado).
- Os testes de arquitetura proíbem `dispatchEvent` fora de `dom.ts`/`abrir-conversa.ts`/`envio-humano.ts` e `chrome.storage` fora do `RepositorioLocal`: o aviso "uma por dia" mora no IndexedDB (`followupConfig` id `historico`) e a troca de modo entre abas usa um pub/sub em memória.
- Um Executor de teste com `tipo: 'followup' | 'reativacao'` agora precisa de `automatico: 'ligado'` + `placarAprovado` na configuração gravada e de um `lerConversa` que devolva mensagens (a releitura).
- `normalizarModo`: config antiga `ligado: true` sem `automatico` vira Observação; um objeto de teste com `automatico: 'desligado'` explícito NÃO é "antigo".
