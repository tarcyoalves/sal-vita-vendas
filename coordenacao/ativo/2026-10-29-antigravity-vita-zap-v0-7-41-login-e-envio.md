# Vita Zap v0.7.41 - Correção de Login de Atendentes e Automação de Envio

- **Agente:** hermes (Antigravity)
- **Início:** 2026-10-29 11:30 BRT
- **Fim:** em andamento
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Corrigir a autenticação da extensão Vita Zap (atendentes travadas no login por host permissions e SameSite de cookie cross-origin, adicionando suporte a token e desbloqueio resiliente) e a automação de envio de mensagens no WhatsApp Web (conferência tolerante ao editor Lexical em reconferirAntesDoClique e limparSeForNosso).

## Arquivos e áreas que vou tocar

- `extensoes/vita-zap/public/manifest.json`
- `extensoes/vita-zap/package.json`
- `extensoes/vita-zap/package-lock.json`
- `client/public/vita-zap/versao.json`
- `extensoes/vita-zap/src/content/crm/bloqueio-tela.ts`
- `extensoes/vita-zap/src/content/execucao.ts`
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

- [ ] Reivindicar trabalho
- [ ] Atualizar permissões de host no manifest.json
- [ ] Implementar suporte a Bearer token e SameSite=None para extensão
- [ ] Corrigir reconferirAntesDoClique e limpeza no executor de envio
- [ ] Aprimorar bloqueio-tela com desbloqueio garantido e auto-conexão de sessão
- [ ] Rodar testes unitários e type-check
- [ ] Publicar build (zip, versao.json) e atualizar ESTADO-DO-PROJETO.md
