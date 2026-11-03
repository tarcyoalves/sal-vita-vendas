# Reivindicação de Trabalho

- **Agente:** hermes
- **Data:** 2026-11-03
- **Assunto:** correcao-busca-e-colagem-mensagem
- **Objetivo:** 
  1. Corrigir falha na colagem de mensagens no WhatsApp Web (Lexical contenteditable) que gerava erro 'colar_falhou' e acumulava problemas na campanha.
  2. Aprimorar a limpeza da busca do WhatsApp Web (clique no botão X e tecla Escape) para evitar que o termo pesquisado fique preso na interface.
  3. Ajustar orientação e padrão de termo na aba Varredura para garantir que a varredura leia todas as 745+ conversas antigas (busca vazia recomendada) e o filtro por nome e data seja aplicado na Prévia.
- **Arquivos previstos:**
  - `extensoes/vita-zap/src/content/dom.ts`
  - `extensoes/vita-zap/src/content/lista.ts`
  - `extensoes/vita-zap/src/sidepanel/Varredura.tsx`
