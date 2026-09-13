/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // Playwright specs live in e2e/ and must not be picked up by Vitest's
    // default `**/*.{test,spec}.*` glob — they need a real browser.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
