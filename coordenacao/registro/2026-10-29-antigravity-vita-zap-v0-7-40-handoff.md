# Registro e Handoff: Vita Zap v0.7.40 - Correção de Classificação de Balões de Sistema e Validação de Colagem

- **Agente:** Antigravity (Hermes / Google Deepmind)
- **Data:** 2026-10-29
- **Status:** Concluído / Pronto para Handoff
- **Branch:** `main` (commit `722fbb3`)

## 1. Contexto do Problema Relatado
O usuário encontrou interrupções na automação de disparo de campanhas do Vita Zap no WhatsApp Web:
- **Print 3 (Claudemir / 7 problemas):** Conversas abertas da agenda sem histórico prévio exibiam apenas o balão de sistema da Meta/WhatsApp ("*As mensagens e ligações são protegidas com a criptografia de ponta a ponta...*"). O classificador antigo via um elemento `.message-in` sem autor de contato e marcava a conversa como `'desconhecido'`, abortando a colagem com *"Não consegui confirmar que é conversa individual. Não colei nada."*
- **Print 1 (#1 e #3 com "O texto não ficou na caixa de mensagem"):** A validação estrita de texto pós-colagem falhava devido a quebras de linha e caracteres invisíveis gerados pelo editor Lexical do WhatsApp Web (`\u200B`, `\uFEFF`).
- **Print 1 (#2 Agro Jequié com "já tem um rascunho na caixa"):** A limpeza do campo pós-falha não esvaziava totalmente o editor Lexical, fazendo com que o próximo contato detectasse o texto residual como um rascunho do usuário.
- **Print 2 (Agropecuária Realidade pausada com texto colado):** O acúmulo de 3 problemas seguidos disparou o disjuntor de segurança (`problemasSeguidos >= 3`), pausando a campanha.

## 2. Soluções Implementadas e Verificadas (v0.7.40)
1. **Filtro de mensagens de sistema (`ehMensagemDoSistema`):**
   - Em `extensoes/vita-zap/src/content/execucao.ts`, balões com padrão de criptografia ou aviso seguro da Meta são ignorados em `classificarConversa()` e `idsDasMensagens()`. Conversas sem histórico de mensagens são classificadas como `individual` com sucesso quando `aceitaSemMensagens = true`.
2. **Normalização e tolerância a Lexical:**
   - Textos colados aceitam equivalência estrita, inclusão mútua e limpeza de caracteres invisíveis (`\u200B`, `\uFEFF`, etc.).
   - Se a caixa já contém o próprio texto da campanha a ser disparada, não rejeita como `caixa_ocupada`.
3. **Limpeza robusta sem violar isolamento de teclado:**
   - Em `dom.ts`, `limparCampo` garante limpeza com `execCommand` e fallback de `textContent = ''` com `Event('input')`, respeitando `tests/envio-isolado.test.ts`.
4. **Qualidade e Deploy:**
   - Todos os 54 arquivos de teste e 766 testes do Vita Zap verdes.
   - `npm run check` no root e no módulo 100% verde.
   - `npm run publicar` executado; sincronização com `Downloads/vita-zap` concluída; commit `722fbb3` enviado para `origin/main`.

## 3. Próximos Passos para o Agente Sucessor
- Orientar o usuário a recarregar a extensão em `chrome://extensions` (confirmando `0.7.40`) e dar `Ctrl + F5` no WhatsApp Web.
- Clicar em *"Recolocar problemas como pendentes"* e *"Retomar"*.
- Monitorar a execução caso o usuário reporte novos comportamentos no WhatsApp Web.
