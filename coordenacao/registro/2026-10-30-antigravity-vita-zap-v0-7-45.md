# Registro: Vita Zap v0.7.45 - Adoção Oficial do Pacote Estabilizado

- **Agente:** Antigravity (Hermes / Google Deepmind)
- **Data:** 2026-10-30 11:58 BRT
- **Status:** Concluído e Publicado
- **Branch:** `main` (commit `340fe02`)
- **Versão:** `0.7.45`

## 1. Escopo e Motivação
O usuário testou no ambiente real a versão `0.7.45` com os ajustes de segurança, homônimos e varredura gerados pelo ChatGPT com base na `0.7.44` de Claude.
Os testes em produção no WhatsApp Web foram bem-sucedidos (automação e varredura fluindo normalmente).
A pedido do usuário, incorporamos formalmente a versão `0.7.45` como a base definitiva no repositório de código-fonte TypeScript, nos testes e na distribuição pública do CRM.

## 2. Mudanças Consolidadas no Código-Fonte Oficial
1. **Manifesto e Segurança (`public/manifest.json` e `tests/extensao-id.test.ts`):**
   - Removido `"https://*/*"` de `optional_host_permissions`.
   - `host_permissions` inclui explicitamente o domínio oficial `https://lembretes.salvitarn.com.br/*` e `https://web.whatsapp.com/*`.
   - `optional_host_permissions` mantido apenas com `http://localhost/*`.
2. **Varredura da Lista (`src/content/varredura.ts`):**
   - Teto de parada baseado em contatos únicos (`nomes.size >= MAX_LINHAS`), evitando abortos prematuros por repetição de itens na rolagem virtualizada.
   - Adicionado aviso explícito caso a rolagem interrompa antes do final real da lista.
3. **Guarda de Homônimos (`src/shared/crm-contatos.ts`):**
   - Em `acharNoIndice`, se houver 2+ contatos cadastrados com o mesmo nome e a conversa não trouxer telefone (`!tel`), devolve `undefined` para não misturar dados de clientes distintos.
4. **Resiliência da Fila Offline (`src/shared/servico-crm.ts`):**
   - `ItemFila` possui contador `tentativas: 0`.
   - Limite de 5 tentativas consecutivas de erro antes de arquivar em falhas para não bloquear a fila permanentemente.
5. **Integração com Correções Anteriores da v0.7.44:**
   - Mantida a seleção precisa de parágrafo e remoção de dispatch duplicado no editor Lexical de `src/content/dom.ts`.
   - Mantido o seletor resiliente de cabeçalho com `title` não truncado em `src/content/execucao.ts`.

## 3. Verificação
- `npm run check` (TypeScript estrito) 100% verde tanto no root quanto na extensão.
- 54 arquivos de teste do Vita Zap (766 testes) passando sem nenhuma falha.
- Testes do CRM na raiz (`tests/extensao-vita-zap.test.ts`, `tests/vita-zap-pagina.test.ts`, `tests/publicacao.test.ts`) 100% verdes.
- Build publicado para `client/public/vita-zap/` (`versao.json` e `vita-zap.zip`).
- Sincronização executada para as pastas e arquivos de download locais.
