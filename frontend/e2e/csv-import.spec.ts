import path from 'node:path'
import { test, expect } from './fixtures'
import { E2E_DATA_DIR } from './paths'
import { gotoView, selectByOption, tableRow } from './helpers'


const SAMPLE = path.join(E2E_DATA_DIR, 'import-sample.csv')
const BAD_DATES = path.join(E2E_DATA_DIR, 'import-bad-dates.csv')

/** Walk the setup step: pick a file and an account, then analyse it. */
async function analyse(page: import('@playwright/test').Page, file: string) {
  await page.getByLabel('CSV file').setInputFiles(file)
  await selectByOption(page, 'Default account').selectOption({ label: 'Joint Checking' })
  await page.getByRole('button', { name: 'Analyze file', exact: true }).click()
}

test.beforeEach(async ({ app: page }) => {
  await gotoView(page, 'Import CSV')
})

test.describe('CSV import', () => {
  test('detects columns, previews statuses, and commits', async ({ app: page }) => {
    await analyse(page, SAMPLE)

    // Detection maps Description -> payee and Notes -> memo via
    // backend/import_mapping_config.json, and infers the ISO date format.
    await expect(page.getByText('Detected settings — review and adjust before previewing.')).toBeVisible()
    await expect(selectByOption(page, 'Select date format')).toHaveValue('%Y-%m-%d')

    await page.getByRole('button', { name: 'Preview', exact: true }).click()

    // Whole Foods replays a seeded Jan 8 row on the same account.
    await expect(tableRow(page, 'Whole Foods')).toContainText('Possible duplicate')
    // "Unmapped Category" matches no existing category.
    await expect(tableRow(page, 'Hardware Store')).toContainText('Needs category')
    await expect(tableRow(page, 'Corner Bakery')).toContainText('OK')

    // Give the unmatched row a category, and skip the duplicate.
    await tableRow(page, 'Hardware Store').getByRole('combobox').nth(1).selectOption({ label: 'Utilities' })
    await tableRow(page, 'Whole Foods').getByRole('checkbox').uncheck()

    await page.getByRole('button', { name: 'Commit 3 transaction(s)', exact: true }).click()
    await expect(page.getByText('Imported 3 transaction(s).')).toBeVisible()

    await page.getByRole('button', { name: 'Back to Dashboard', exact: true }).click()
    await gotoView(page, 'Transactions')
    await expect(page.getByText('21 results')).toBeVisible()
    await expect(tableRow(page, 'Corner Bakery')).toContainText('Joint Checking')
    // Imported rows get a split from the same category > account > global cascade.
    await expect(tableRow(page, 'Corner Bakery')).toContainText('Alice')
  })

  test('blocks the preview until the required columns are mapped', async ({ app: page }) => {
    await analyse(page, SAMPLE)
    await selectByOption(page, 'Select date format').selectOption('')
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled()
  })

  test('flags rows it cannot parse', async ({ app: page }) => {
    await analyse(page, BAD_DATES)
    // No date format can be inferred from "not-a-date"; pick one by hand.
    await selectByOption(page, 'Select date format').selectOption('%Y-%m-%d')
    await page.getByRole('button', { name: 'Preview', exact: true }).click()

    // A row that fails to parse keeps none of its parsed fields, so it shows up
    // as an error badge with em dashes rather than under its payee.
    await expect(page.getByText(/^Error: /)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Commit/ })).toBeDisabled()
  })

  test('cannot analyse without a file', async ({ app: page }) => {
    await expect(page.getByRole('button', { name: 'Analyze file', exact: true })).toBeDisabled()
  })
})
