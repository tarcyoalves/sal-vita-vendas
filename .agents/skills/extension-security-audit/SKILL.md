---
name: extension-security-audit
description: Auditoria rigorosa de segurança, conformidade sanitária e privacidade para extensões Chrome comerciais. Verificação de CSP, proteção contra vazamento de mensagens/contatos, validação de remetentes de mensagens externas, controle de disparos automatizados e isolamento de permissões.
---

# Extension Security Audit: Privacidade, Conformidade e Segurança em Extensões

Esta skill estabelece os controles de segurança e auditoria para extensões que operam em ambientes sensíveis (como WhatsApp Web e CRMs comerciais), garantindo conformidade com a Chrome Web Store e proteção absoluta dos dados do usuário.

---

## 1. Privacidade Absoluta dos Dados de Conversa (Zero Data Leak)

- **Sem Telemetria ou Envio Oculto de Mensagens**:
  - Conteúdo de mensagens, áudios, mídias e contatos do WhatsApp Web **NUNCA** devem ser transmitidos para servidores de terceiros ou serviços de analytics.
  - Toda análise (como classificação de data de conversa ou correspondência de nomes) deve ocorrer **100% no cliente**, no próprio navegador do usuário.
- **Armazenamento Seguro e Criptografado no Cliente**:
  - Dados sensíveis salvos em `chrome.storage.local` ou `IndexedDB` devem ser acessíveis apenas pela extensão autorizada.
  - Nunca salve tokens de autenticação ou senhas em texto puro em logs ou repositórios públicos.

---

## 2. Content Security Policy (CSP) e Código Executável

O Manifest V3 proíbe estritamente a execução de código arbitrário e remoto:
1. **Sem `eval()` ou `new Function()`**: Toda lógica deve ser empacotada localmente no build estático.
2. **Sem scripts remotos (`<script src="https://...">`)**: Não utilize bibliotecas carregadas por CDN. Todas as dependências devem ser instaladas via npm e compiladas pelo Vite/Webpack no bundle local.
3. **Sem `inline script` não autorizado**: O painel e páginas HTML da extensão devem seguir o CSP padrão do Manifest V3.

---

## 3. Segurança em Mensagens Externas (`externally_connectable`)

Se a extensão aceita mensagens de domínios web (ex: `https://lembretes.salvitarn.com.br`):
```ts
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // 1. Validação obrigatória da origem do remetente
  const origensPermitidas = [
    'https://lembretes.salvitarn.com.br',
    'http://localhost:5173', // Apenas desenvolvimento local
  ];
  if (!sender.url || !origensPermitidas.some(o => sender.url!.startsWith(o))) {
    console.warn('[Segurança] Mensagem rejeitada de origem não autorizada:', sender.url);
    sendResponse({ ok: false, erro: 'Origem não autorizada' });
    return false;
  }

  // 2. Validação estrita do payload com schema ou tipos discriminados
  if (!msg || typeof msg !== 'object' || typeof msg.tipo !== 'string') {
    sendResponse({ ok: false, erro: 'Payload inválido' });
    return false;
  }

  // 3. Processamento seguro
  tratarComandoExterno(msg).then(sendResponse);
  return true;
});
```

---

## 4. Prevenção de Bloqueios e Banimentos no WhatsApp

Para proteger a conta comercial do usuário contra banimentos pelo WhatsApp:
1. **Envio Humanizado Obrigatório**:
   - Pausa prévia aleatória entre 2.000ms e 4.000ms antes de qualquer clique.
   - Intervalo mínimo de 60 a 120 segundos entre disparos consecutivos em campanhas.
   - Variação natural nas coordenadas dos cliques dentro do botão de envio.
2. **Isolamento de Gatilhos de Envio**:
   - Apenas o arquivo designado (ex: `src/content/envio-humano.ts`) pode conter gatilhos que acionem o envio.
   - Nenhum evento sintético de teclado (`Enter`, `keydown`) deve ser injetado globalmente na página.
3. **Prioridade para Confirmação Humana**:
   - Sempre que possível, o rascunho deve ser inserido na caixa de texto para que o próprio atendente revise e confirme o envio com a tecla Enter manual.
