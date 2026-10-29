# Vita Zap v0.7.41 - Correção de Login de Atendentes e Automação de Envio

- **Agente:** hermes (Antigravity)
- **Início:** 2026-10-29 11:30 BRT
- **Fim:** 2026-10-29 12:00 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Corrigir a autenticação da extensão Vita Zap (atendentes travadas no login por host permissions e SameSite de cookie cross-origin, adicionando suporte a token e desbloqueio resiliente) e a automação de envio de mensagens no WhatsApp Web (conferência tolerante ao editor Lexical em reconferirAntesDoClique e limparSeForNosso).

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/public/manifest.json`
- `extensoes/vita-zap/package.json`
- `extensoes/vita-zap/package-lock.json`
- `client/public/vita-zap/versao.json`
- `client/public/vita-zap/vita-zap.zip`
- `extensoes/vita-zap/src/content/crm/bloqueio-tela.ts`
- `extensoes/vita-zap/src/content/dom.ts`
- `extensoes/vita-zap/src/content/envio-humano.ts`
- `extensoes/vita-zap/src/shared/servico-crm.ts`
- `extensoes/vita-zap/src/shared/crm-rede.ts`
- `extensoes/vita-zap/tests/extensao-id.test.ts`
- `extensoes/vita-zap/tests/envio-isolado.test.ts`
- `server/auth.ts`
- `server/trpc.ts`
- `server/routers/auth.ts`
- `ESTADO-DO-PROJETO.md`

## Progresso

- [x] Reivindicar trabalho
- [x] Atualizar permissões de host no manifest.json (adicionar https://lembretes.salvitarn.com.br/* em host_permissions)
- [x] Implementar suporte a Bearer token e emissão do JWT nas rotas auth.login e auth.me
- [x] Adicionar fallback no dom.ts para o editor Lexical
- [x] Aprimorar bloqueio-tela com desbloqueio com timeout garantido (400ms) e link direto para o CRM
- [x] Rodar testes unitários (766 testes na extensão, 1570 no root — 100% verdes) e type-check
- [x] Publicar build v0.7.41 (zip, versao.json) e atualizar ESTADO-DO-PROJETO.md

## Resultado

1. Atendentes novas não ficam mais travadas na tela de login: o Chrome agora permite nativamente chamadas à API do CRM via `host_permissions` e autenticação com `Bearer token` além de cookies.
2. Desbloqueio imediato do WhatsApp Web após clique em entrar ou conectar sessão ativa.
3. Fallback no editor Lexical garantindo preenchimento e detecção de envio sem falsos-positivos.
4. Versão 0.7.41 empacotada e disponibilizada para download no CRM (`client/public/vita-zap/`).
