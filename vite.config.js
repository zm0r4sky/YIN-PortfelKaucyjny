import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/YIN-PortfelKaucyjny/',
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }))
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'YIN-PortfelKaucyjny',
        short_name: 'Portfel Kaucyjny',
        description: 'Aplikacja do zarządzania paragonami kaucyjnymi z recyklomatów',
        theme_color: '#ffffff',
        orientation: 'portrait',
        display: 'standalone',
        background_color: '#0f172a',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
