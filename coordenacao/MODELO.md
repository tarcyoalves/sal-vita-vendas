# <Título curto do trabalho>

- **Agente:** <hermes | claude | cursor | codex | humano-nome>
- **Início:** <AAAA-MM-DD HH:MM BRT>
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

<O que você vai fazer e por quê, em duas ou três frases. Se veio de um pedido do
dono, resuma o pedido.>

## Arquivos e áreas que vou tocar

<Seja específico. É por esta lista que outro agente decide se pode trabalhar em
paralelo com você.>

- `caminho/do/arquivo.ts`
- `caminho/da/pasta/`

**Não vou tocar em:** <o que está fora do escopo, se ajudar a evitar dúvida>

## Progresso

- [ ] <passo 1>
- [ ] <passo 2>

---

<!-- Preencha o resto AO CONCLUIR, antes de mover para coordenacao/registro/ -->

## Resultado

<O que mudou, do ponto de vista de quem usa o sistema.>

## Commits

<Hashes que estão em `origin/main`. Confira com:
`git merge-base --is-ancestor <hash> origin/main && echo "está em main"`>

- `abc1234` — <mensagem>

## Verificado

<O comando que você rodou e o resultado que viu. Só o que rodou nesta sessão.>

- `npm run check` — 0 erros
- `npm test` — N testes passando

## Não verificado / pendente

<O que você não conseguiu testar e por quê (sem acesso ao banco, depende de
dado real, etc.). O que ficou por fazer.>

## Armadilhas encontradas

<Qualquer coisa que pegaria o próximo agente de surpresa. Se for uma lição
geral, acrescente também na seção 7 do `HANDOFF-HERMES.md`.>
