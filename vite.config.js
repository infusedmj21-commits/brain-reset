import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'Brain Reset',
        short_name: 'Brain Reset',
        description: 'Daily routine for focus, memory and Spanish.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0e0f0d',
        theme_color: '#0e0f0d',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
        navigateFallback: 'index.html'
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
