# Vita Zap 0.7.56: reativação por inatividade + trava de agendamento

- **Agente:** claude
- **Início:** 2026-11-17
- **Fim:** 2026-11-17
- **Status:** parcial (servidor em `main`; extensão 0.7.56 só na branch, não publicada no site)
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só os commits do servidor vão para `main`

## Objetivo

Pedido do dono (17/11): follow-up automático por inatividade (25/30/40 dias desde a última conversa), porque a versão web
do WhatsApp não guarda histórico antigo: a IA lê a última conversa, salva um resumo no CRM e decide se o cliente precisa
agora (mensagem do dono), precisa de mais tempo (agendamento no CRM) ou precisa de você. Trava: cliente com agendamento
futuro no CRM não entra em reativação, campanha nem cobrança; o agendamento prevalece.

## Arquivos e áreas que vou tocar

- Servidor (vai para `main`): `server/lib/zapIa.ts`, `server/routers/zapIa.ts` (procedure `avaliarReativacao`),
  `server/lib/zapAgendamentos.ts` e `server/routers/zapCrm.ts` (novos: lista de agendamentos futuros, só leitura),
  `server/routers/index.ts` (registro do router novo), `tests/zap-ia.test.ts`, `tests/zap-crm.test.ts` (novo).
  Sem tabela nem coluna nova (sem SCHEMA_VERSION).
- Extensão (só na branch): `extensoes/vita-zap/src/shared/` (reativacao*.ts, trava-agendamento.ts novos; banco.ts, servico-ia.ts,
  servico-crm.ts, leads.ts, mensagens.ts, crm-remoto.ts), `sidepanel/` (Reativacao.tsx e motor novos; executor.ts, Followup.tsx, App.tsx),
  `content/execucao.ts` (lerConversa devolve o telefone), testes, versão 0.7.56.
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md` (seção 11), `extensoes/vita-zap/README.md`.

**Não vou tocar em:** `coordenacao/ativo/2026-10-15-*` (análise de crédito), nenhum outro arquivo do CRM.

## Progresso

- [x] servidor: avaliarReativacao + agendamentos futuros + testes (main)
- [x] extensão: regras, trava, motor, tela, testes, build, zip local

## Resultado
Servidor (main): `zapIa.avaliarReativacao`, `gerarCobranca` com `contexto: 'reativacao'`, `zapCrm.agendamentosFuturos`, `zapCrm.registrarReativacao` (resumo nas notas do lead sem contar contato). Sem migração. Extensão 0.7.56: aba Reativação, trava de agendamento (Prévia, Executor, cobrança, reativação), IndexedDB v3.

## Commits
main: `e5a4910`, `b2e19f8`, `65e677d`. Branch `claude/magical-fermi-wrdxjy`: os mesmos + commit da extensão 0.7.56.

## Verificado
Main (worktree de origin/main, env de IA simulado): check 0 erros, 125 arquivos / 1774 testes. Extensão: tsc ok, build ok, `npm test` 1131 ok + só `publicacao.test.ts` (pré-existente); Chromium real 21/21 (`run-reativacao.cjs`).

## Não verificado
WhatsApp real, IA real, deploy do servidor, envio real pelo Executor no Chromium (horário), `npm run publicar` NÃO feito.

## Armadilhas
`tasks.update` conta contato ao mudar notas (por isso procedimento próprio); `tasks.reminders` só olha 7 dias; nomes com dígito ("A1") não geram primeiro nome; Followup/Reativação ficam montados escondidos: precisam recarregar ao ficar à vista (`ativa`).
