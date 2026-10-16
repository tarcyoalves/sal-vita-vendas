#!/usr/bin/env node
/**
 * Regressão da "rolagem dupla": o AppShell é `h-dvh overflow-hidden` e quem rola é o <main>.
 * Se algum elemento fora do fluxo (ex.: `sr-only`/absolute sem ancestral posicionado) esticar o
 * DOCUMENTO, aparece uma segunda barra de rolagem e o shell inteiro sobe. Este script falha
 * se `document.scrollingElement.scrollHeight > window.innerHeight` em qualquer rota.
 *
 * COMO RODAR (não faz parte do `npm test`; nunca altera o package.json do projeto):
 *   1. Instale o Playwright FORA do repo:   mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright
 *      (Chromium já instalado, ex.: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; não rode `playwright install` aqui.)
 *   2. Na raiz do repo (com node_modules instalado):
 *        PLAYWRIGHT_DIR=/tmp/pw node scripts/e2e/scroll-duplo.mjs
 *      Opcionais: BASE_URL=http://localhost:5173 (usa um vite já rodando; senão o script sobe um na porta 5199),
 *                 SHOTS=/tmp/shots (grava screenshots), VERBOSE=1 (lista elementos que passam da janela).
 *   Sai com código 1 se alguma rota/viewport estourar. A API é toda simulada com page.route (sem banco/rede).
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const ROTAS = ['/admin/analise-credito', '/admin/faturamento', '/tasks', '/admin/dashboard'];
const VIEWPORTS = [{ width: 1536, height: 720 }, { width: 1536, height: 925 }];
const PORT = 5199;
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`;

const usuario = { id: 1, name: 'Tarcyo Alves', email: 'tarcyo@example.com', role: 'admin', mustChangePassword: false };
const itensArquivo = [1, 2].map((id) => ({
  id, documento: '12345678000195', razaoSocial: `Cliente Exemplo ${id} Ltda`, municipio: 'Mossoro', uf: 'RN', score: 700,
  veredito: 'APROVADO', consultadoEm: new Date('2026-10-10T12:00:00Z'), consultadoPor: 'Tarcyo Alves', custoReais: 12.5,
  pedidosVinculados: 1, produto: 'x', produtoNome: 'Relatório completo',
}));
const RESPOSTAS = {
  'auth.me': usuario,
  'credito.status': { provedor: 'apifull', simulado: false, limiteMensal: 100, usadasNoMes: 12, bloqueioAtivo: false, tetoPorConsultaReais: 30, gastoNoMesReais: 150 },
  'credito.saldo': { saldo: 523.4 },
  'credito.catalogo': { itens: [], precosMedidosEm: '2026-10-01', tetoPorConsultaReais: 30, ultimoPorProduto: null },
  'credito.listar': { total: 2, itens: itensArquivo },
  'tasks.deletionLogs': [],
  'faturamento.pendingApproval': [],
};

/** superjson mínimo: Date vira string + meta, o resto passa direto. */
function superjson(valor) {
  const values = {};
  const walk = (v, p) => {
    if (v instanceof Date) { values[p.join('.')] = ['Date']; return v.toISOString(); }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, [...p, i]));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, [...p, k])]));
    return v;
  };
  const json = walk(valor, []);
  return Object.keys(values).length ? { json, meta: { values } } : { json };
}

async function simularApi(page) {
  await page.route('**/api/trpc/**', async (route) => {
    const url = new URL(route.request().url());
    const nomes = decodeURIComponent(url.pathname.split('/api/trpc/')[1]).split(',');
    const itens = nomes.map((n) => (n in RESPOSTAS
      ? { result: { data: superjson(RESPOSTAS[n]) } }
      : { error: { json: { message: `sem mock: ${n}`, code: -32004, data: { code: 'NOT_FOUND', httpStatus: 404, path: n } } } }));
    const batch = url.searchParams.get('batch') === '1';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(batch ? itens : itens[0]) });
  });
  // Nada de rede externa (fontes, logotipo): o layout não depende delas.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return /^https?:\/\/(localhost|127\.0\.0\.1)/.test(u) ? route.fallback() : route.fulfill({ status: 204, body: '' });
  });
}

async function medir(page) {
  return page.evaluate(() => {
    const se = document.scrollingElement;
    const main = document.querySelector('main');
    const vh = window.innerHeight;
    const fora = [];
    for (const el of document.body.querySelectorAll('*')) {
      const pos = getComputedStyle(el).position;
      const dentroDoMain = !!main?.contains(el);
      // Dentro do <main> só importa o que escapa dele: elemento absoluto/fixo.
      if (dentroDoMain && pos !== 'absolute' && pos !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > vh + 0.5) {
        const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : '';
        fora.push(`${el.tagName.toLowerCase()}${cls} bottom=${Math.round(r.bottom)} pos=${pos} emMain=${dentroDoMain}`);
      }
    }
    return { scrollHeight: se.scrollHeight, innerHeight: vh, mainScrollHeight: main?.scrollHeight ?? null, body: Math.round(document.body.getBoundingClientRect().height), fora: fora.slice(0, 12) };
  });
}

let vite = null;
if (!process.env.BASE_URL) {
  vite = spawn('npx', ['vite', 'client', '-c', 'vite.config.ts', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (process.env.SHOTS) mkdirSync(process.env.SHOTS, { recursive: true });

const browser = await chromium.launch();
let falhas = 0;
try {
  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport });
    for (const rota of ROTAS) {
      const page = await ctx.newPage();
      await simularApi(page);
      await page.goto(BASE + rota, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const m = await medir(page);
      const ok = m.scrollHeight <= m.innerHeight;
      if (!ok) falhas++;
      console.log(`${ok ? 'OK   ' : 'FALHA'} ${viewport.width}x${viewport.height} ${rota}  documento.scrollHeight=${m.scrollHeight} innerHeight=${m.innerHeight} body=${m.body} main.scrollHeight=${m.mainScrollHeight}`);
      if (!ok || process.env.VERBOSE) for (const l of m.fora) console.log('      fora da janela:', l);
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `${rota.replace(/\W+/g, '_')}-${viewport.height}.png`), fullPage: false });
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  vite?.kill();
}
if (falhas) { console.error(`\n${falhas} medição(ões) com rolagem dupla.`); process.exit(1); }
console.log('\nSem rolagem dupla em nenhuma rota.');
