// Build 1: painel lateral (React) + service worker (módulo ES).
// O content script é construído à parte (vite.content.config.ts) porque content
// scripts do Chrome não aceitam `import` — precisam ser um arquivo único (IIFE).
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error módulo .mjs de ferramenta (sem tipos)
import { gerarManifesto } from './dev/manifesto.mjs';

/**
 * Manifesto do dist/: produção = public/manifest.json sem endereço local (o build FALHA se tiver); `--mode development`
 * (npm run build:dev) acrescenta o localhost de dev/manifest.dev.json.
 */
function manifestoDoBuild(desenvolvimento: boolean): Plugin {
  return {
    name: 'vita-zap-manifesto',
    apply: 'build',
    closeBundle() {
      const base = JSON.parse(readFileSync(resolve(__dirname, 'public/manifest.json'), 'utf8'));
      if (!desenvolvimento) {
        gerarManifesto(base, false); // só confere: o dist/ leva o public/manifest.json como está
        return;
      }
      const extra = JSON.parse(readFileSync(resolve(__dirname, 'dev/manifest.dev.json'), 'utf8'));
      writeFileSync(resolve(__dirname, 'dist/manifest.json'), `${JSON.stringify(gerarManifesto(base, true, extra), null, 2)}\n`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), manifestoDoBuild(mode === 'development')],
  define: { __VZ_DEV__: JSON.stringify(mode === 'development') },
  // A extensão é independente do CRM: não herda o postcss/tailwind da raiz do repositório.
  css: { postcss: { plugins: [] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
}));
