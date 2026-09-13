import { test as base, expect, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { BACKEND_DIR, E2E_DATABASE_URL } from './paths'

const PYTHON = process.env.PYTHON ?? 'python'

/**
 * Re-run `seed.py` against the throwaway database.
 *
 * Every test shares one backend process and one SQLite file (`workers: 1` in
 * playwright.config.ts), so this is what keeps tests independent of each other
 * and of their execution order. It costs ~0.5s per test.
 */
export function reseedDatabase(): void {
  execFileSync(PYTHON, ['seed.py'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  })
}

type Fixtures = {
  /** Auto fixture: restores the seed data before the test body runs. */
  resetDb: void
  /** A page on `/` with the first-launch choice already made (Alice selected). */
  app: Page
  /** A page on `/` with empty localStorage — for testing first launch itself. */
  freshApp: Page
}

export const test = base.extend<Fixtures>({
  resetDb: [
    async ({}, use) => {
      reseedDatabase()
      await use()
    },
    { auto: true },
  ],

  app: async ({ page, resetDb }, use) => {
    void resetDb // declare the dependency so the reseed happens before we load
    // FirstLaunchUserPrompt is a non-dismissable modal (no close button, no-op
    // onClose) and it disables the nav button, so skipping it is a precondition
    // for every test that isn't about first launch.
    // Seed-if-absent, not overwrite: addInitScript runs on every navigation,
    // so forcing these would undo anything the test itself changed and then
    // reloaded to verify (the theme toggle, the user filter).
    await page.addInitScript(() => {
      const seed: Record<string, string> = {
        userChoiceMade: '1',
        selectedUserId: '1', // Alice, from seed.py
        theme: 'light',
      }
      for (const [key, value] of Object.entries(seed)) {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
      }
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'MyFinance', level: 1 })).toBeVisible()
    await use(page)
  },

  freshApp: async ({ page, resetDb }, use) => {
    void resetDb
    await page.goto('/')
    await use(page)
  },
})

export { expect }
