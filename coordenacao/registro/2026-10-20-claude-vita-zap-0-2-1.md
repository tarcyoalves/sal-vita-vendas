# Vita Zap 0.2.1 — motivo do erro, diagnóstico e WhatsApp Web atual

- **Agente:** claude
- **Início:** 2026-10-20
- **Fim:** 2026-10-20
- **Status:** concluído (sem push; commit no branch do worktree)
- **Branch:** `worktree-agent-ab171c38f82fc5aeb` (base: 4c96c7b, Vita Zap 0.2.0)

## Objetivo

Campanha de 1 contato terminou "0 enviados, 1 problemas, Concluída" em verde sem mostrar o
motivo. Mostrar o motivo, criar diagnóstico copiável, proteger o content script contra
contexto invalidado e corrigir a classificação individual x grupo no WhatsApp Web atual.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (somente)

## Resultado

Alerta com contato/código/mensagem; "Concluída com problemas"; diagnóstico (200 eventos,
IndexedDB v3); pedido `diagnosticar` somente leitura; content script seguro contra contexto
invalidado; `data-id` sem JID tratado (`.message-out`, `data-pre-plain-text`, ícone de grupo).

## Verificado

- `npx tsc --noEmit -p .`, `npm test` (360 testes), `npm run build` — ok

## Não verificado / pendente

- Nada foi validado contra o WhatsApp Web real; checklist manual do README continua valendo.

## Armadilhas encontradas

- O worktree nasceu de uma base anterior à 0.2.0; foi preciso rebasear em 4c96c7b.
