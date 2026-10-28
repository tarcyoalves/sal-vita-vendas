---
name: playwright-extension-testing
description: Testes automatizados E2E, regressão e validação visual de extensões Chrome com Playwright e Vitest. Carregamento de extensões desempacotadas (--load-extension), harnesses locais de simulação do WhatsApp Web, testes de sidepanel e prevenção de regressões sem dependência de contas reais.
---

# Playwright & Extension Testing: Qualidade e E2E Automatizado

Esta skill define as diretrizes para testes automatizados de extensões Chrome, combinando testes unitários rápidos de DOM sintético (Vitest + JSDOM) com testes ponta a ponta (E2E) completos no navegador real usando Playwright.

---

## 1. Carregamento da Extensão no Playwright

No Manifest V3, o Playwright precisa carregar a extensão desempacotada apontando para o diretório de build (`dist/`):

```ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '../dist');
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensões MV3 exigem modo com interface ou flags específicas
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});
```

---

## 2. Testando o Painel Lateral (Side Panel)

O Side Panel é uma página HTML comum com acesso às APIs de extensão:
```ts
test('carrega o painel lateral e exibe abas principais', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await page.waitForSelector('#root');
  await expect(page.locator('button:has-text("Lembretes")')).toBeVisible();
  await expect(page.locator('button:has-text("Prévia")')).toBeVisible();
});
```

---

## 3. Harness Local para Simulação do WhatsApp Web (Sem Conta Real)

Nunca dependa de uma conta real ativa de WhatsApp para testes de regressão automatizados em CI/CD:
1. **Página de Harness**: Crie um servidor local (ex: `dev/servir.mjs` servindo `dev/harness.html`) com a estrutura de nós `#pane-side`, `#main`, campos de busca e listas virtualizadas reproduzindo fielmente o DOM do WhatsApp Web.
2. **Injeção do Content Script**: Configure o teste para carregar o harness local simulando mutações de chat e cliques.
3. **Validação de Fluxos Críticos**:
   - Varredura de contatos e paginação de scroll.
   - Aplicação de filtros de data e tags.
   - Verificação de que nenhum clique de envio ocorre sem autorização explícita do usuário.

---

## 4. Testes Sintéticos em JSDOM (Pirâmide de Testes Rápida)

Para validação diária ultrarrápida antes de commits:
- Simule o DOM do WhatsApp Web com helpers sintéticos (`tests/ajuda/whatsapp-web-2026.ts`).
- Execute contratos de integridade arquitetural:
  - `tests/envio-isolado.test.ts`: Garante que nenhum arquivo fora de módulos explicitamente autorizados invoque `.click()`, eventos de tecla ou envie mensagens.
  - `tests/crm-consumo-conteudo.test.ts`: Garante que navegação contínua na página não dispare chamadas desnecessárias à API/CRM.
  - `tests/extensao-id.test.ts`: Garante consistência do ID e chaves no manifesto.
