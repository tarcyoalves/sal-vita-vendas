# Vita Zap 0.7.54: follow-up com IA (cobrança automática + "Precisa de você")

- **Agente:** claude
- **Início:** 2026-11-17
- **Fim:** 2026-11-17
- **Status:** parcial (tudo na branch; NÃO está em `main` nem publicado no site)
- **Branch:** `claude/magical-fermi-wrdxjy`

## Objetivo

Pedido do dono: uma IA que leia as respostas dos disparos e entenda quem precisa de atenção. Quem NÃO respondeu é cobrado sozinho
depois de X dias (mesmo motor e política das campanhas); quem respondeu e exige atenção vai para "Precisa de você" com resposta
sugerida (sem envio automático); pedido de sair vira opt-out. A IA roda no servidor do CRM (`server/lib/llm.ts`).

## Arquivos e áreas que toquei

- `server/lib/zapIa.ts`, `server/routers/zapIa.ts` (novos), registro em `server/routers/index.ts`, `tests/zap-ia.test.ts`
- `extensoes/vita-zap/`: `shared/followup.ts`, `shared/servico-ia.ts`, `sidepanel/followup-motor.ts`, `sidepanel/Followup.tsx`,
  `sidepanel/trava-whatsapp.ts`; alterados `content/execucao.ts` (`lerConversa`), `content/index.ts`, `shared/banco.ts` (IndexedDB v2),
  `shared/campanha.ts`, `shared/exportar.ts`, `shared/leads.ts`, `shared/mensagens.ts`, `shared/servico-crm.ts`, `sidepanel/App.tsx`,
  `sidepanel/Execucao.tsx`, `sidepanel/executor.ts`; versão 0.7.54 (manifest, package, lock); testes novos `tests/followup-*.test.ts`
- `docs/PLANO-CAMPANHAS-WHATSAPP.md` (seção 10), `extensoes/vita-zap/README.md` (seção 3.4), `ESTADO-DO-PROJETO.md`

Sem tabela nova no CRM (sem SCHEMA_VERSION). `api/bundle.js` NÃO foi refeito (o `vercel-build` o regenera; ver Armadilhas).

## Resultado

Aba **Follow-up** no painel: cobrança automática (desligada de fábrica, liga só com confirmação do risco), listas "Cobrança automática",
"Precisa de você" (inclui "revisar"), "Pediram para sair" e "Resolvido". Servidor: `zapIa.classificarConversas` e `zapIa.gerarCobranca`.

## Commits

Ver `git log claude/magical-fermi-wrdxjy` (feat(zap-ia), feat(vita-zap) 0.7.54, chore(coord)). Nenhum está em `main`.

## Verificado

- Raiz: `npm run check` 0 erros; `npm test` 117 arquivos, 1610 testes passando (39 novos em `tests/zap-ia.test.ts`, LLM e banco mockados).
- Extensão: `npm test` 889 passando e 1 falhando que JÁ falhava antes (`tests/publicacao.test.ts`: o site publica 0.7.46 e o manifest está acima desde
  a 0.7.47; some quando o dono aprovar `npm run publicar`); 95 testes novos (regras 43, motor+Executor real 32, leitura da conversa em jsdom 5,
  ponte da IA 10, arquitetura 5). `npm run build` ok.
- Chromium real com a extensão construída (harness em `/tmp/.../scratchpad/e2e/run-followup.cjs`, WhatsApp falso): 11/11 (lerConversa, grupo e
  nome parecido recusados, IndexedDB v1→v2 sem perder dados, aba Follow-up, confirmação do risco, verificar agora, Abrir e colar sem enviar).

## Não verificado / pendente

- WhatsApp Web REAL (seletores da leitura da conversa, carimbo `data-pre-plain-text`, mídia do cliente) e o efeito das cobranças no número.
- IA REAL (só LLM mockado). O endpoint "antigravity" com Gemini: compatibilidade com `/chat/completions` NÃO verificada, nada foi inventado.
- Procedures `zapIa` contra o CRM em produção (não foi feito deploy; esta branch não foi para `main`).
- Aprovação do dono para publicar a 0.7.54 no site (`npm run publicar` NÃO foi rodado).

## Armadilhas encontradas

- `beforeEach(() => mock.mockReset())` (arrow sem chaves) devolve o mock: o Vitest o executa como limpeza e o teste falha de forma enganosa.
- O Executor aplicava o piso fixo de 14 dias a todas as campanhas: uma cobrança de follow-up (o disparo original tem poucos dias) seria "pulada". Campanhas
  `tipo: 'followup'` usam X dias (`filtros.excluirContatadosHaDias`).
- O schema zod do backup (`exportar.ts`) descarta campos desconhecidos: `tipo` precisou entrar lá, senão importar um backup transformava a cobrança em campanha comum.
- O `ref` enviado à IA é "c1", "c2"…: a chave do contato é o nome normalizado e não pode ir ao servidor.
- Cobrança que saiu nunca pode deixar de ser contada (máx. 2): `aplicarResultadoCampanha` é idempotente e vale também para "monitorando".
