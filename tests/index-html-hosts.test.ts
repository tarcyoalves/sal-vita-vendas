/**
 * Um único client/index.html serve a loja e o CRM interno. Os dois scripts
 * inline do <head> decidem, em runtime, o que vale para cada host.
 *
 * O teste carrega o HTML DE VERDADE (o de client/, não uma cópia) num DOM e
 * confere o resultado por hostname. É a única forma de pegar regressão aqui:
 * typecheck não olha para HTML e build não executa esses scripts.
 *
 * O que estava errado antes: o Meta Pixel bootava em qualquer host, então toda
 * tela do CRM autenticado mandava PageView para a Meta.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, test } from 'vitest';

const HTML_PATH = resolve(__dirname, '../client/index.html');
let html: string;

beforeAll(() => {
  html = readFileSync(HTML_PATH, 'utf8');
});

/**
 * Monta o documento no host/rota pedidos e devolve o que interessa.
 *
 * `runScripts: 'dangerously'` é o que faz o jsdom executar os inline scripts —
 * sem isso o head não seria avaliado e o teste não provaria nada. O
 * `resourceLoader` não busca nada externo: o pixel é detectado pela tag
 * <script> que ele insere, não pelo download.
 */
function render(url: string) {
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: false });
  const { document } = dom.window;
  const pixelInjected = [...document.querySelectorAll('script[src]')].some((s) =>
    (s.getAttribute('src') || '').includes('connect.facebook.net'),
  );
  return {
    title: document.title,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    hasProductLd: document.getElementById('ld-product') != null,
    // `fbq` só existe se o IIFE do pixel rodou.
    fbqDefined: typeof (dom.window as unknown as { fbq?: unknown }).fbq !== 'undefined',
    pixelInjected,
  };
}

describe('CRM (lembretes.salvitarn.com.br)', () => {
  test('não carrega o Meta Pixel', () => {
    // O CRM é interno e autenticado: nada de rastreamento de anúncio nele.
    const got = render('https://lembretes.salvitarn.com.br/tasks');
    expect(got.fbqDefined).toBe(false);
    expect(got.pixelInjected).toBe(false);
  });

  test('usa o próprio título e sai do índice', () => {
    const got = render('https://lembretes.salvitarn.com.br/tasks');
    expect(got.title).toBe('Sal Vita — Lembretes');
    expect(got.robots).toBe('noindex, nofollow');
    expect(got.description).toContain('Sistema interno');
  });

  test('descarta o JSON-LD de produto da loja', () => {
    // Preço e disponibilidade do sal não têm sentido dentro do CRM.
    expect(render('https://lembretes.salvitarn.com.br/tasks').hasProductLd).toBe(false);
  });
});

describe('loja (premium.salvitarn.com.br)', () => {
  test('carrega o Meta Pixel nos dois hosts, com e sem www', () => {
    for (const host of ['premium.salvitarn.com.br', 'www.premium.salvitarn.com.br']) {
      const got = render(`https://${host}/`);
      expect(got.fbqDefined, host).toBe(true);
      expect(got.pixelInjected, host).toBe(true);
    }
  });

  test('mantém título, indexação e JSON-LD de produto', () => {
    // Esse head é o que scraper de WhatsApp/Facebook lê — e scraper não roda JS,
    // então precisa estar correto no HTML estático.
    const got = render('https://premium.salvitarn.com.br/');
    expect(got.title).toContain('Sal Vita Premium');
    expect(got.robots).toBe('index, follow');
    expect(got.hasProductLd).toBe(true);
  });
});

describe('rota /sal-vita em qualquer host', () => {
  test('carrega o pixel, porque é a landing da loja', () => {
    // vercel.json reescreve o domínio premium para /sal-vita; a rota também
    // responde no host do CRM e continua sendo página de venda.
    expect(render('https://lembretes.salvitarn.com.br/sal-vita').fbqDefined).toBe(true);
  });
});

describe('host desconhecido (preview da Vercel)', () => {
  test('não carrega o pixel nem se identifica como CRM', () => {
    // Deploy preview (*.vercel.app) não é loja: não deve poluir o pixel com
    // tráfego de teste. E não é o host do CRM, então o head estático da loja
    // permanece — é o comportamento atual, registrado aqui de propósito.
    const got = render('https://sal-vita-vendas-abc123.vercel.app/tasks');
    expect(got.fbqDefined).toBe(false);
    expect(got.title).toContain('Sal Vita Premium');
  });
});
