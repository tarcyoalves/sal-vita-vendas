# Protocolo de coordenação entre IAs

- **Agente:** claude
- **Início:** 2026-09-24 16:20 BRT
- **Fim:** 2026-09-24 16:23 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Criar o protocolo que faz cada IA deixar registrado o que está alterando e o que
concluiu, para que agentes rodando em paralelo (Hermes/Antigravity, Claude,
Cursor, etc.) não colidam. Pedido do dono logo depois do handoff do Hermes
(`f70f076`, mesma sessão).

## Arquivos e áreas que vou tocar

- `coordenacao/` (novo)
- `HANDOFF-HERMES.md`, `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `ESTADO-DO-PROJETO.md`
- `.cursorrules`, `.windsurfrules`, `.kiro/steering/`, `CLAUDE_PROMPT.md`

**Não vou tocar em código** (`client/`, `server/`, `api/`).

## Progresso

- [x] Reivindicação criada e publicada (`6a9ab91`)
- [x] Protocolo escrito (`coordenacao/README.md`, `coordenacao/MODELO.md`)
- [x] Todas as IAs roteadas para ele
- [x] Concluído e movido para `registro/`

---

## Resultado

- **`coordenacao/`** com `README.md` (protocolo), `MODELO.md` (modelo de
  reivindicação), `ativo/` (trabalho em andamento) e `registro/` (histórico).
  Uma reivindicação por arquivo, para duas IAs nunca disputarem o mesmo arquivo
  de controle.
- **Nove pontos de entrada de IA** levam ao protocolo: `AGENTS.md` e `GEMINI.md`
  (Antigravity, OpenCode), `CLAUDE.md` (Claude), `.cursorrules` (Cursor),
  `.windsurfrules` (Windsurf), `.kiro/steering/regras-do-projeto.md` (Kiro),
  `HANDOFF-HERMES.md`, `ESTADO-DO-PROJETO.md` e `CLAUDE_PROMPT.md`.
- `HANDOFF-HERMES.md`: regra inviolável nº 11, fluxo de trabalho e protocolo de
  sessão com os passos de coordenação.
- `.cursorrules` e `.windsurfrules` passaram a ser cópias do `AGENTS.md` (antes
  só falavam do grafo de código e nem apontavam para o `ESTADO`).
- `CLAUDE_PROMPT.md` marcado como obsoleto: dizia que o deploy era no Render.com.

## Commits

- `6a9ab91` — chore(coord): claim coordination protocol work
- este commit — chore(coord): finish coordination protocol

## Verificado

- **Simulação de dois agentes** num repositório git local: o primeiro publica a
  reivindicação; o push simultâneo do segundo é **recusado**
  (`[rejected] main -> main (fetch first)`); ele faz `pull --rebase`, vê a
  sobreposição em `ativo/`, remove a sua e publica a desistência. Sobra só a
  reivindicação do primeiro. O protocolo funciona como escrito.
- `git pull --rebase` com mudança não commitada é recusado pelo git — testado,
  e o protocolo foi corrigido para mandar commitar antes de puxar.
- O comando da seção 6 (`git log -1 --format="%cr — %s" -- <arquivo>`) roda.
- Os nove pontos de entrada contêm `coordenacao/` (conferido com `grep`).
- `npm run check` — 0 erros; `npm test` — 22 passando.

## Não verificado / pendente

- **Se o Antigravity lê `AGENTS.md` ou `GEMINI.md`** — os dois estão iguais,
  então vale qualquer um. O dono deve mandar o Hermes ler `HANDOFF-HERMES.md`
  e `coordenacao/README.md` explicitamente no primeiro prompt.
- O protocolo depende de cada agente segui-lo. Não há trava técnica: um agente
  que ignora `coordenacao/` ainda pode colidir. O git só barra o push
  simultâneo, não a edição do mesmo arquivo em momentos diferentes.
- **O bug do webhook do Resend do CRM continua aberto** (`HANDOFF-HERMES.md`,
  seção 11, item 1). Não foi escopo desta reivindicação.

## Armadilhas encontradas

- **O git não versiona pasta vazia.** Na primeira versão do protocolo, quando
  `ativo/` esvaziasse ela sumiria dos clones dos outros agentes, e o
  `ls coordenacao/ativo/` e o `cp` para dentro dela falhariam no primeiro passo.
  Pego pela simulação; corrigido com `.gitkeep` em `ativo/` e `registro/`.
- **`git pull --rebase` exige árvore limpa.** A primeira versão do protocolo
  mandava puxar antes de commitar — um agente seguindo o texto travaria.
