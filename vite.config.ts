import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['sal-vita-logo.svg'],
      manifest: {
        name: 'Sal Vita — Lembretes',
        short_name: 'Sal Vita',
        description: 'Sistema de Gestão de Vendas e Lembretes',
        theme_color: '#1d4ed8',
        background_color: '#1d4ed8',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'sal-vita-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // Code-splitting por produto (App.tsx): o bundle único de ~2 MB virou entry (~560 kB,
        // loja + framework) + um chunk por página do CRM. Pré-cache SÓ do que a loja
        // Premium usa (entry, CSS, HTML, ícones e as páginas secundárias da loja); senão
        // todo visitante da loja baixaria o CRM inteiro em segundo plano pelo service worker.
        // Os chunks do CRM entram no cache sob demanda (runtimeCaching abaixo): no PWA
        // instalado, tela já aberta funciona offline; tela nunca aberta exige rede.
        globPatterns: [
          '**/*.{css,html,svg,png,ico,woff,woff2}',
          'assets/index-*.js',
          'assets/{SalVitaAdmin,TrackOrder,Atacado}-*.js',
        ],
        // Limite padrão do workbox (2 MiB) como trava: se um chunk pré-cacheado estourar,
        // o build falha — divida com import() em vez de subir o limite (já falhou em 29/09).
        runtimeCaching: [
          {
            // Chunks com hash no nome são imutáveis: CacheFirst é seguro. O hash novo de
            // um deploy gera outra URL; as antigas expiram pelo limite abaixo.
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-chunks',
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
});
