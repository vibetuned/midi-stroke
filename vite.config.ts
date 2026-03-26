import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Midi Stroke',
        short_name: 'MidiStroke',
        description: 'Piano & Drum MIDI trainer',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: '/vite.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Precache Vite bundles + catalog JSON files
        globPatterns: ['**/*.{js,css,html,wasm}', '*.json'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50 MiB (Verovio WASM is large)
        runtimeCaching: [
          {
            // Cache MEI score files on first access
            urlPattern: /\/(?:piano|drums)\/.*\.mei$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mei-files',
              expiration: { maxEntries: 700, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Cache Salamander piano audio samples from external CDN
            urlPattern: /^https:\/\/tonejs\.github\.io\/audio\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'salamander-audio',
              expiration: { maxEntries: 200, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    https: {
      key: fs.readFileSync('./certs/localhost+2-key.pem'),
      cert: fs.readFileSync('./certs/localhost+2.pem'),
    },
  },
})
