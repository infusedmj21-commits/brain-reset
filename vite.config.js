import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'Artemis',
        short_name: 'Artemis',
        description: 'Life dashboard: ventures, shifts, money, health and the Brain Reset routine.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#B28570',
        theme_color: '#B28570',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
        navigateFallback: 'index.html'
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
