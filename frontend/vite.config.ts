import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { assertPublicBuildEnv } from './src/config/publicEnvGuard.js'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  assertPublicBuildEnv(loadEnv(mode, process.cwd(), 'VITE_'))
  return {
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'push-handler.js'],
      manifest: {
        id: '/',
        name: 'Alerta de Chuva Cajamar',
        short_name: 'Chuva Cajamar',
        description:
          'Condições meteorológicas, chuva observada e mapa de Cajamar, SP.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#f4f8fc',
        theme_color: '#0b4f9c',
        categories: ['weather', 'utilities', 'government'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Mapa de Cajamar',
            short_name: 'Mapa',
            description: 'Abrir o mapa do município',
            url: '/mapa',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        importScripts: ['/push-handler.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(?:[a-z0-9-]+\.)?tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,

  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react'
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
            if (id.includes('leaflet')) {
              return 'vendor-leaflet'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide'
            }
            if (id.includes('workbox') || id.includes('vite-plugin-pwa')) {
              return 'vendor-pwa'
            }
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
  }
})
