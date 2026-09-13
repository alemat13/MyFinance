import { chromium } from '@playwright/test'

/**
 * Warm Vite's on-demand transform cache.
 *
 * The dev server compiles the module graph (react-markdown, recharts, …) on the
 * first request, which can take 15-20s on a cold CI runner. Paying that here
 * keeps it out of the first spec's own test timeout.
 */
export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5273'
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(baseURL, { timeout: 120_000 })
    await page.getByRole('heading', { name: 'MyFinance', level: 1 }).waitFor({ timeout: 120_000 })
  } finally {
    await browser.close()
  }
}
