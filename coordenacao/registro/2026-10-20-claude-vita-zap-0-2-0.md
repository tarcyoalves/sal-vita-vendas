# Vita Zap 0.2.0 — correções de segurança de uso do copiloto no WhatsApp Web

- **Agente:** claude
- **Início:** 2026-10-20
- **Fim:** 2026-10-20
- **Status:** concluído (pendente de validação manual no WhatsApp real)
- **Branch:** `worktree-agent-a76981a185f4b6845` (sem push)

## Objetivo

Corrigir os achados A1–A12 e P1 da revisão da extensão `extensoes/vita-zap` e aproveitar as
ideias I1–I4 da outra extensão, sem afrouxar a regra "a extensão nunca envia sozinha".

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (src, tests, README, manifest e package.json em 0.2.0)

**Não toquei em:** nada fora de `extensoes/vita-zap/` (exceto este registro).

## Resultado

- Nada abre sozinho depois do intervalo ("Próximo pronto" + botão Abrir próximo); `focus()` só
  com o foco livre de texto do usuário.
- Item em andamento persistido no IndexedDB (banco v2, store `emAndamento`); retomada confere a
  conversa antes de colar; "Já enviei"; pendências entregues quando o painel volta.
- Emoji lido por `alt`/`data-plain-text`; reconferência antes/depois de colar; JID estável e
  gravado no envio; lista de busca estável; grupo por prefixo "Fulano:"; clique no título.
- Quebra de linha rejeitada e texto revalidado antes de colar; cancelamento ao pausar;
  expiração avisada; geração do content script; intervalo global; avisos do WhatsApp pausam.

## Verificado

- `npx tsc --noEmit -p .` em `extensoes/vita-zap` — 0 erros
- `npm test` em `extensoes/vita-zap` — 318 testes passando
- `npm run build` em `extensoes/vita-zap` — dist gerado (não versionado)

## Não verificado / pendente

Tudo que depende do WhatsApp Web real (seletores novos, emoji no editor, botão X, avisos,
`.message-out`, prévia de grupo, foco). Ver README da extensão, seções 6 e 7.

## Armadilhas encontradas

- jsdom não tem `execCommand`, `innerText` nem aceita `view: window` em `MouseEvent`: os testes
  usam um WhatsApp falso (`tests/_whatsapp-falso.ts`) e o código tem fallback sem `view`.
- Dentro de `avancar()` o guard `avancando` impede nova chamada a `avancar()`: use `passo()`.
