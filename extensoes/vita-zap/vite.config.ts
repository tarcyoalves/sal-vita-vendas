// Build 1: painel lateral (React) + service worker (módulo ES).
// O content script é construído à parte (vite.content.config.ts) porque content
// scripts do Chrome não aceitam `import` — precisam ser um arquivo único (IIFE).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
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
});
