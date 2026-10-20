# Vita Zap 0.2.2 — busca sem rótulo, envio sem in/out e linhas virtualizadas

- **Agente:** claude
- **Início:** 2026-10-20
- **Fim:** 2026-10-20
- **Status:** concluído (sem push; commit no branch do worktree)
- **Branch:** `worktree-agent-a63f8f00c30cd304b` (base: 88f794d, Vita Zap 0.2.1)

## Objetivo

Adaptar a extensão ao DOM real do WhatsApp Web de 20/10/2026 coletado pelo dono: input de busca
com `aria-label` vazio (erro `seletor` na 2ª operação), mensagens como `[role="row"]`
virtualizadas com `conv-msg-<ID>` e sem `.message-in/.message-out`.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (somente)

## Resultado

Seletores de busca e do X ("End icon button", só em `#side`, só com texto na busca); detecção
de envio por id novo + texto igual + caixa vazia; classificação por autores; diagnóstico da
busca e das linhas; README com o risco residual.

## Verificado

- `npm test`, `npx tsc --noEmit -p .`, `npm run build` — ok (jsdom; nada contra o WhatsApp real)

## Não verificado / pendente

- Nada foi validado contra o WhatsApp Web real; checklist manual do README continua valendo.
