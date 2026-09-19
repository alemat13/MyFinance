/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Chrome only offers "Install app" once the service worker can answer
      // start_url with a 200 while offline, so the app shell (HTML, JS, CSS,
      // icons) is precached and navigations fall back to it. Only the shell:
      // every figure on screen still comes from the API, so launching offline
      // gets you the app with no data in it, not an offline-first PWA.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Navigations go to the network first and only fall back to the
        // precached shell when it can't be reached. Production sits behind
        // Google IAP, which re-authenticates by redirecting a navigation to
        // the Google sign-in page: answering navigations from the cache (what
        // workbox's navigateFallback does) would hide that redirect, leaving
        // an expired session stuck on a shell whose every API call fails.
        navigateFallback: undefined,
        // Without this, workbox's precache route answers "/" from the cached
        // index.html before the navigation strategy below ever runs.
        directoryIndex: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigations',
              plugins: [
                {
                  handlerDidError: async () =>
                    (await caches.match('/index.html', { ignoreSearch: true })) ||
                    Response.error(),
                },
              ],
            },
          },
        ],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'MyFinance',
        short_name: 'MyFinance',
        description: 'Personal finance dashboard',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#4f46e5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
