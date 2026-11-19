// Build 2: content script do WhatsApp Web como arquivo único (IIFE), sem imports.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // O public/ (manifest, ícones) já foi copiado pelo build 1; copiar de novo desfaria o manifesto de desenvolvimento.
  publicDir: false,
  css: { postcss: { plugins: [] } },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'VitaZapContent',
      fileName: () => 'content.js',
    },
  },
});
