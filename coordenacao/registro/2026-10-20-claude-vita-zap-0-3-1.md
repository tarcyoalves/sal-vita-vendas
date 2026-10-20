# Vita Zap 0.3.1 — conversa só com mensagens minhas e freio do automático

- **Agente:** claude
- **Início:** 2026-10-20
- **Fim:** 2026-10-20
- **Status:** concluído (commit no branch do worktree, sem push)
- **Branch:** `worktree-agent-aff6c1faf46e7ff4b`

## Objetivo

Campo (modo automático): dois contatos falharam com `nao_confirmado` antes de colar porque as
únicas mensagens visíveis eram minhas (✓✓), sem `.message-in/.message-out`. Reconhecer a mensagem
minha pelo ícone de status, aprender o meu nome, reclassificar e não deixar conferências de antes
de colar acionarem o freio.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (src, tests, README, versão em manifest/package/lock)

**Não toquei em:** o CRM, a loja Premium e o resto do repositório.

## Resultado

- Mensagem minha = ícone/rótulo de status; meu nome aprendido e editável (aba Dados).
- Classificação por `autoresDoOutroLado`; linhas de sistema ignoradas.
- `nao_confirmado`, `ambiguo`, `grupo`, `caixa_ocupada`, `usuario_digitando` viram "pulado (revisar)" e não contam no freio.
- Diagnóstico com contagens, nome (3 letras) e `data-icon` das linhas.

## Verificado

- `npm test` (extensoes/vita-zap) — 478 testes passando
- `npx tsc --noEmit -p .` — 0 erros
- `npm run build` — ok

## Não verificado / pendente

- Nada foi visto no WhatsApp Web real: os `data-icon` e `aria-label` de status vêm da descrição do dono.
  Rodar "Testar página do WhatsApp" numa conversa só com mensagens minhas e conferir "data-icon nas linhas".

## Armadilhas encontradas

- O teste `envio-so-no-automatico-autorizado` proíbe `send`/`enviar` em qualquer arquivo de content
  fora de `envioAutomatico.ts`: nomes novos devem evitar essas palavras (use "status", "minha").
- Agora 1 autor do outro lado diferente do título (e que não é o meu nome) dá `grupo`, não `desconhecido`.
