# Vita Zap 0.7.60, lote 2: "não enviar mais" e contato da equipe, tela Hoje, resultado por texto

- **Agente:** claude
- **Início:** 2026-11-18
- **Fim:** 2026-11-18
- **Status:** parcial (servidor em `main`; extensão 0.7.60 só na branch, não publicada no site)
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só os commits do servidor vão para `main`

## Objetivo

Pedido do dono (lote 2): (1) "não enviar mais" e registro de contato compartilhados entre atendentes e computadores, com o CRM como fonte;
(2) tela "Hoje" (resumo só leitura) e barra de abas que cabe em 400 px; (3) resultado por texto (enviado / respondeu) só local. Nada fora desta lista.

## Arquivos e áreas que toquei

- Servidor (em `main`): `server/db/schema.ts`, `server/db/migrate.ts` (tabelas NOVAS `zap_opt_outs` e `zap_contatos_enviados`, `SCHEMA_VERSION` = `2026-11-18a`),
  `tests/schema-version.lock.json`, `tests/consumo-banco-lote4.test.ts` (não prende mais a versão antiga), `server/lib/zapContatos.ts` e `server/routers/zapContatos.ts` (novos),
  `server/routers/index.ts` (registro do router), `tests/zap-contatos.test.ts` (novo).
- Extensão (só na branch): `extensoes/vita-zap/src/` (shared: `equipe.ts`, `servico-equipe.ts`, `hash.ts`, `hoje.ts`, `resultado-texto.ts` novos; `banco.ts`, `exportar.ts`, `filtros.ts`, `followup.ts`, `leads.ts`, `servico-crm.ts`, `crm-remoto.ts`;
  sidepanel: `sincronia-equipe.ts`, `equipe.ts`, `Hoje.tsx`, `abas.ts`, `ResultadosTexto.tsx`, `saude-painel.ts` novos; `executor.ts`, os três motores, `Previa.tsx`, `Dados.tsx`, `App.tsx`, `Automaticos.tsx`, `automaticos-motor.ts`, `MensagemCobranca.tsx`, `Followup.tsx`, `Reativacao.tsx`, `Execucao.tsx`, `PedirIa.tsx`, `estilo.css`), testes, versão 0.7.60.
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md` (seção 14), `extensoes/vita-zap/README.md` (3.8), `ESTADO-DO-PROJETO.md`.

## Progresso

- [x] servidor: tabelas aditivas + router + testes (em `main`)
- [x] extensão: sincronização da equipe, Hoje, resultado por texto
- [x] docs, testes, Chromium real, zip local `/home/user/vita-zap-0.7.60-local.zip` (sem `npm run publicar`)

## Resultado

Ver `docs/PLANO-CAMPANHAS-WHATSAPP.md` seção 14. Em uma linha: o "não enviar mais" e o último contato (tipo e data, nunca o texto) passam a viver no CRM e valer para todos;
a aba **Hoje** abre primeiro e resume o dia; cada texto do dono mostra quantos foram enviados e quantos responderam (local).

## Commits

- main: `9be4d26` claim, `b643d6e` tabelas + migração (SCHEMA_VERSION 2026-11-18a), `b18ac52` router `zapContatos`, `8eab33c` `consultarContatados` com `incluirOptOut`.
- branch `claude/magical-fermi-wrdxjy`: os mesmos (cherry-pick, hashes `f5269ee`, `f782b98`, `bd54bba`) + `a2fa2c4` extensão 0.7.60 + este registro.

## Verificado

- Servidor, em worktree de `origin/main` com `ANTIGRAVITY02_*`/`GROQ_API_KEY` simuladas: `npm run check` 0 erros; `npx vitest run` 126 arquivos, 1823 testes (inclui `tests/schema-migrations.test.ts`, 6 testes, e `tests/zap-contatos.test.ts`, 24). A migração é só `CREATE TABLE/INDEX IF NOT EXISTS` de tabelas novas.
- Extensão: `tsc` e `npm run build` ok; `npm test` 1461 passando e só `tests/publicacao.test.ts` falhando (pré-existente: o site publica a 0.7.46).
  Testes novos: regras da equipe (21), serviço contra o CRM falso que usa a MESMA lógica de casamento do servidor (13), sincronização no painel (23), Executor + equipe (21), filtros/cobrança (9), resultado por texto + migração v4→v5 (9),
  Hoje (14 regras + 9 painel) e arquitetura (7); mais casos nos testes de follow-up e reativação.
- Chromium real com a extensão construída (`e2e/run-equipe.cjs`, WhatsApp falso e CRM falso com estado): 20/20 (banco v4→v5 sem perda, Hoje como aba inicial com os números certos, barra a 400 px sem corte, opt-out de outro atendente passa a valer,
  o antigo sobe, nada de texto de mensagem no fio, editor com "enviado 42 · respondeu 9 (21%)" e zerando ao editar, Eva e Caio não abertos na reativação, "Tirar" desfaz no CRM, aviso com o CRM sem o servidor novo). Print: `e2e/hoje.png` (400 px).

## Não verificado / pendente

- WhatsApp Web REAL; o servidor novo em produção (deploy não conferido aqui; a extensão trata a falta das tabelas como "CRM indisponível"); o opt-out/desfazer entre DOIS computadores reais; migração com milhares de envios.
- Envio automático real pelo Executor com a conferência da equipe (só nos testes com Executor real e no WhatsApp/CRM falsos).
- `npm run publicar` NÃO feito (aprovação do dono pendente).

## Armadilhas encontradas

- A branch e `main` divergem em `server/db/schema.ts` (outros agentes): o cherry-pick dos commits do servidor conflita no fim do arquivo; resolver mantendo só as tabelas novas.
- `tests/consumo-banco-lote4.test.ts` prendia `SCHEMA_VERSION = '2026-10-20a'`: qualquer bump quebrava; agora só exige versão >= e igual ao lock.
- Os testes de arquitetura procuram identificadores: `conferirAntesDeEnviar` já é a releitura do Executor (a conferência da equipe se chama `conferirEquipeAntesDeEnviar`) e a regex de teclado reprova `charCodeAt` (o hash usa `codePointAt`).
- A tela Hoje agora é a aba inicial do painel (`ABA_INICIAL` em `sidepanel/abas.ts`): para voltar aos Lembretes é só mudar essa constante.
- A equipe só é consultada pelo painel (nunca pelo service worker por conta própria): o aviso de "histórico sumindo" do alarme diário não conhece o contato da equipe.
