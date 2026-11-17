# Vita Zap 0.7.55: o dono define o estilo da mensagem de cobrança

- **Agente:** claude
- **Início:** 2026-11-17
- **Fim:** 2026-11-17
- **Status:** parcial (servidor em `main`; extensão 0.7.55 só na branch, não publicada no site)
- **Branch:** `claude/magical-fermi-wrdxjy` (extensão, NÃO vai para `main`); só o commit do servidor vai para `main`

## Objetivo

Pedido do dono (17/11): "eu que tenho que definir o estilo de mensagem". Os textos genéricos de modelo da cobrança automática
deixam de ser usados. O dono escreve as variações da 1ª e da 2ª cobrança ({nome}) ou deixa a IA escrever no estilo dele
(instruções + os textos dele como exemplos). Sem texto salvo, a cobrança automática não liga.

## Arquivos e áreas que vou tocar

- Servidor (vai para `main`): `server/lib/zapIa.ts`, `server/routers/zapIa.ts` (campos opcionais `estilo` e `exemplos` em `gerarCobranca`), `tests/zap-ia.test.ts`
- Extensão (só na branch): `extensoes/vita-zap/src/shared/followup.ts`, `shared/followup-estilo.ts` (novo), `shared/servico-ia.ts`,
  `shared/servico-crm.ts`, `shared/leads.ts`, `sidepanel/followup-motor.ts`, `sidepanel/Followup.tsx`, testes `tests/followup-*.test.ts`, versão 0.7.55
- Docs: `docs/PLANO-CAMPANHAS-WHATSAPP.md` (seção 10), `extensoes/vita-zap/README.md`

**Não vou tocar em:** `coordenacao/ativo/2026-10-15-*` (análise de crédito), nenhum outro arquivo do CRM.

## Progresso

- [x] servidor: estilo/exemplos em gerarCobranca + testes (commit no branch e cherry-pick para main)
- [x] extensão: config, validação, sorteio, motor, tela, testes, build, zip local

## Resultado

Servidor (em `main`): `zapIa.gerarCobranca` aceita `estilo` (<=500) e `exemplos` (<=10 de <=300); mesma validação de saída; aceita `{nome}` na saída da IA. Extensão 0.7.55 (branch): mensagem de cobrança do dono (dois modos), bloqueio de ligar sem texto, validação espelhada, fila refeita ao mudar a config, rótulo de origem, prévia, migração da config antiga.

## Commits

- main: `efec8e4` feat(zap-ia): owner style and examples for gerarCobranca (e `45ddd98` claim)
- branch `claude/magical-fermi-wrdxjy`: `5c233a2` (mesmo commit do servidor) + commit da extensão 0.7.55

## Verificado

- Servidor, em worktree de `origin/main` com ANTIGRAVITY02_*/GROQ_API_KEY simuladas: `npm run check` 0 erros; `npx vitest run` 124 arquivos, 1733 testes.
- Extensão: `npm run build` ok; `npm test` só falha `tests/publicacao.test.ts` (pré-existente); Chromium real 9/9 (harness `run-followup-estilo.cjs`).

## Não verificado / pendente

- IA real (só mockada); WhatsApp Web real; `zapIa.gerarCobranca` com estilo em produção (servidor novo está em `main`, deploy não conferido aqui). Servidor antigo ignora `estilo`/`exemplos` (o zod descarta) e o texto ainda passa pela validação local.
- "Ver exemplo" no modo IA não chama a IA.
- Publicação no site (`npm run publicar`) NÃO feita; aprovação do dono pendente.

## Armadilhas encontradas

- O teste de código-fonte `envio-isolado` proíbe `charCode` em qualquer arquivo (usei `codePointAt`).
- Campanha de cobrança já montada guarda `modelo` por item: mudar a config sem alinhar a campanha enviaria texto velho.
