# Claim: Vita Zap v0.7.38 - Correção de Envio Automático e Bloqueio de Clique

- **Agente:** hermes (Gemini / Antigravity)
- **Início:** 2026-10-28 14:45 BRT
- **Fim:** 2026-10-28 15:10 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Corrigir a automação de envio do Vita Zap que colou o texto na caixa de mensagem mas não realizou o disparo / pulou o contato, tratando:
1. Falso-positivo de bloqueio por aviso/modal (`avisoDoWhatsAppAberto()` disparado por banners inferiores como o anúncio de download do WhatsApp Windows ou alerts não obstrutivos).
2. Localização e acionamento garantido do botão de envio (`encontrarBotaoEnviar` e `clicarBotaoEnviarHumano`).
3. Reavaliação de pré-clique (`reconferirAntesDoClique`).
4. Versão 0.7.38 em todos os arquivos de manifesto, versão, testes e sincronização de distribuição.

## Arquivos em Escopo

- `extensoes/vita-zap/src/content/execucao.ts`
- `extensoes/vita-zap/src/content/envio-humano.ts`
- `extensoes/vita-zap/package.json`
- `extensoes/vita-zap/public/manifest.json`
- `extensoes/vita-zap/tests/extensao-id.test.ts`
- `extensoes/vita-zap/tests/` (testes unitários correspondentes)
- `client/public/vita-zap/versao.json`
- `ESTADO-DO-PROJETO.md`
