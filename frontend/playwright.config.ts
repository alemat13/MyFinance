import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKEND_DIR, E2E_DATABASE_URL } from './e2e/paths'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Ports deliberately offset from the documented dev ports (8000 / 5173) so a
 *  running `uvicorn --reload` or `npm run dev` is neither killed nor reused. */
const BACKEND_PORT = 8010
const FRONTEND_PORT = 5273

const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`
const API_URL = `http://127.0.0.1:${BACKEND_PORT}/api`

process.env.E2E_BASE_URL = FRONTEND_ORIGIN

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // One backend on one SQLite file is shared by every test, so tests must not
  // race each other. Isolation comes from the per-test reseed in e2e/fixtures.ts.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: FRONTEND_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    // formatMoney()/formatDateGroupHeader() hardcode en-US, but
    // accountingMonthLabel() uses toLocaleString('default') and `new Date(iso +
    // 'T00:00:00')` is local time — pin both so labels are deterministic.
    locale: 'en-US',
    timezoneId: 'UTC',
    // index.html's inline bootstrap falls back to prefers-color-scheme.
    colorScheme: 'light',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Seed before uvicorn in the same command, so the health check below can
      // only pass once the throwaway database exists and is populated.
      command: `python seed.py && python -m uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: BACKEND_DIR,
      url: `${API_URL}/users`,
      // Never reuse: a server already on this port may be pointed at a different
      // DATABASE_URL, and every test would then silently run against it.
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        CORS_ALLOWED_ORIGINS: `${FRONTEND_ORIGIN},http://localhost:${FRONTEND_PORT}`,
      },
    },
    {
      // VITE_API_URL is baked in at dev-server start; without it the client
      // would fall back to `http://<hostname>:8000/api` and hit a dev backend.
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      cwd: here,
      url: FRONTEND_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
})
