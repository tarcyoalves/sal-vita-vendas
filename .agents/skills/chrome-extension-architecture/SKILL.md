---
name: chrome-extension-architecture
description: Arquitetura profissional para extensões Chrome modernas com Manifest V3. Organização de Service Worker, Content Scripts em Shadow DOM, Side Panel em React, passagem de mensagens tipadas, armazenamento offline (chrome.storage e IndexedDB) e permissões mínimas.
---

# Chrome Extension Architecture: Manifest V3 Profissional

Esta skill define os padrões de engenharia para extensões Chrome baseadas no Manifest V3, garantindo estabilidade, ciclo de vida correto do Service Worker, comunicação assíncrona robusta e isolamento de responsabilidades.

---

## 1. Topologia de Componentes no Manifest V3

Uma extensão moderna de alto nível (estilo WAPlus/copiloto) divide-se em 4 camadas bem delimitadas:

```
┌────────────────────────────────────────────────────────┐
│                   Side Panel (React)                   │
│   Dashboard comercial, campanhas, lembretes e prévias   │
└──────────────┬───────────────────────────▲─────────────┘
               │ chrome.runtime.sendMessage│
               ▼                           │
┌────────────────────────────────────────────────────────┐
│             Background Service Worker                  │
│   Alarmes offline, notificações, chamadas ao CRM/API   │
└──────────────┬───────────────────────────▲─────────────┘
               │ chrome.tabs.sendMessage   │
               ▼                           │
┌────────────────────────────────────────────────────────┐
│             Content Script (WhatsApp Web)              │
│   Shadow DOM UI (barra VZ, faixa lead), DOM Observer   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Ciclo de Vida do Service Worker (SW)

No Manifest V3, o Service Worker é **efêmero**: ele é finalizado após ~30 segundos de inatividade e reiniciado quando necessário.

### Regras Invioláveis do Service Worker:
1. **Nunca use variáveis globais em memória para estado persistente**: Qualquer variável de módulo será zerada quando o SW for descarregado.
2. **Nunca use `setInterval` para tarefas de longo prazo**: Use a API `chrome.alarms` (`chrome.alarms.create(nome, { delayInMinutes, periodInMinutes })`).
3. **Não use `window` ou DOM**: O SW roda em contexto de Worker (apenas APIs globais como `self`, `fetch`, `caches`, `crypto`).
4. **Registro de ouvintes síncrono no topo do arquivo**:
```ts
// src/background/service-worker.ts
chrome.runtime.onInstalled.addListener(async (detalhes) => { /* ... */ });
chrome.alarms.onAlarm.addListener(async (alarme) => { /* ... */ });
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  // Retorne true se a resposta for assíncrona!
  tratarMensagem(msg).then(responder);
  return true;
});
```

---

## 3. Padrão de Passagem de Mensagens Tipadas (Message Passing)

Mensagens entre Content Script, Background e Side Panel devem seguir contratos estritos com união discriminada (Discriminated Unions):

```ts
export type MensagemExtensao =
  | { tipo: 'abrirConversa'; nome: string; telefone?: string; rascunho?: string }
  | { tipo: 'consultarLead'; telefone: string }
  | { tipo: 'notificarLembrete'; lembreteId: string; titulo: string };

export type RespostaExtensao<T = unknown> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; codigo?: string };
```

- **Respostas assíncronas**: Sempre retorne `true` no listener `onMessage` se a resposta for enviada via callback `sendResponse` após uma Promise.
- **Detecção de contexto invalidado**: No Content Script, proteja chamadas de mensageria verificando se `chrome.runtime?.id` ainda existe para evitar erros de extensão recarregada.

---

## 4. Estratégia de Armazenamento Segregado

- **`chrome.storage.local`**: Configurações de usuário, tokens de autenticação, preferências, cache de lembretes ativos e flags de UI.
- **`IndexedDB` (via `idb`)**: Grandes volumes de dados offline, histórico de varreduras da agenda, lotes de contatos de campanhas e métricas.
- **Padrão Repository**: Nunca acesse `chrome.storage` ou `indexedDB` diretamente em componentes de UI ou scripts de injeção. Crie uma interface abstrata (`RepositorioContatos`) e implemente-a em um único arquivo (ex: `src/shared/repositorio-local.ts`).

---

## 5. Princípio do Menor Privilégio (Least Privilege)

- **Permissões mínimas no `manifest.json`**:
  - `sidePanel`: Exibição do copiloto lateral.
  - `storage`: Persistência local segura.
  - `alarms`: Agendamento de lembretes sem polling contínuo.
  - `notifications`: Avisos do sistema operacional.
- **Host permissions restritas**:
  - Apenas `https://web.whatsapp.com/*` como permissão obrigatória.
  - Domínios de CRM e APIs como permissões opcionais (`optional_host_permissions`) requisitadas sob demanda.
