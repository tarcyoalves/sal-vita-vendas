# Reivindicação: Vita Zap v0.7.37 - Correção de classificação de conversa individual e envio de mensagem

- **Agente:** Antigravity (Gemini)
- **Data:** 2026-10-28
- **Status:** concluído

## Contexto e Objetivo
O usuário reportou que no disparo automático a extensão identifica o cliente/chat, mas passa para o próximo sem colocar a mensagem e sem enviar.
A causa raiz foi identificada em `classificarConversa`:
1. Quando uma conversa individual tem push name do contato diferente do nome/título comercial salvo no CRM/agenda (ex: "Carlos" vs "Padaria do Carlos - Cliente"), `autorBateComTitulo` classificava a conversa como "grupo" ou "desconhecido".
2. Mensagens de áudio/mídia/sem data-pre-plain-text geravam `semAutor > 0`, causando recusa estrita imediata.
3. Isso fazia `abrirEColar` retornar `nao_confirmado` sem colar o texto, levando o executor a pular para o próximo contato.

## Escopo
- `extensoes/vita-zap/src/content/execucao.ts`: simplificar e tornar robusta a classificação de conversa individual (identifica grupos apenas por sinais inequívocos: ícone de grupo, subtítulo de participantes, autor na bolha de mensagem, múltiplos autores distintos ou JID @g.us).
- `extensoes/vita-zap/src/content/dom.ts`: fallback de inserção com InputEvent se `execCommand` falhar.
- `extensoes/vita-zap/src/content/envio-humano.ts`: incluir seletores adicionais de botão enviar (`[data-testid="send"]`, `[data-testid="compose-btn-send"]`, etc.).
- Bumping da versão para 0.7.37 em:
  - `extensoes/vita-zap/package.json`
  - `extensoes/vita-zap/public/manifest.json`
  - `client/public/vita-zap/versao.json`
  - `ESTADO-DO-PROJETO.md`
- Build, testes e sincronização dos diretórios locais de distribuição.
