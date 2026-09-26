import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '../support/fixtures'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.join(__dirname, '..', 'fixtures', name)

test('happy path: auto-detected column mapping imports two transactions', async ({ page }) => {
  await page.goto('/?view=import')

  await page.getByLabel('CSV or QIF file').setInputFiles(fixture('sample-import.csv'))
  await page.getByRole('combobox').filter({ hasText: 'Default account' }).selectOption({ label: 'Joint Checking' })
  await page.getByRole('button', { name: 'Analyze file' }).click()

  // Column mapping auto-detected from headers Date/Payee/Amount/Memo/Category
  await expect(page.getByLabel('Date column')).toHaveValue('Date')
  await expect(page.getByLabel('Payee column')).toHaveValue('Payee')
  await expect(page.getByLabel('Amount column')).toHaveValue('Amount')
  await expect(page.getByLabel('Category column (optional)')).toHaveValue('Category')

  await page.getByRole('button', { name: 'Preview' }).click()

  const groceryRow = page.locator('tbody tr').filter({ hasText: 'E2E Grocery Store' })
  const freelanceRow = page.locator('tbody tr').filter({ hasText: 'E2E Freelance Client' })
  await expect(groceryRow.getByText('OK', { exact: true })).toBeVisible()
  await expect(freelanceRow.getByText('OK', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Commit 2 transaction(s)' }).click()
  await expect(page.getByText('Imported 2 transaction(s).')).toBeVisible()

  await page.goto('/?view=transactions')
  await page.getByPlaceholder('Search payee/memo').fill('E2E Grocery Store')
  await expect(page.locator('tbody tr').filter({ hasText: 'E2E Grocery Store' })).toBeVisible()
})

test('duplicate detection: re-importing the same file flags possible duplicates', async ({ page }) => {
  await page.goto('/?view=import')

  await page.getByLabel('CSV or QIF file').setInputFiles(fixture('sample-import.csv'))
  await page.getByRole('combobox').filter({ hasText: 'Default account' }).selectOption({ label: 'Joint Checking' })
  await page.getByRole('button', { name: 'Analyze file' }).click()
  await page.getByRole('button', { name: 'Preview' }).click()

  const groceryRow = page.locator('tbody tr').filter({ hasText: 'E2E Grocery Store' })
  const freelanceRow = page.locator('tbody tr').filter({ hasText: 'E2E Freelance Client' })
  await expect(groceryRow.getByText('Possible duplicate')).toBeVisible()
  await expect(freelanceRow.getByText('Possible duplicate')).toBeVisible()
})

test('manual column mapping override for unrecognized headers', async ({ page }) => {
  await page.goto('/?view=import')

  await page.getByLabel('CSV or QIF file').setInputFiles(fixture('sample-import-custom-headers.csv'))
  await page.getByRole('combobox').filter({ hasText: 'Default account' }).selectOption({ label: 'Joint Checking' })
  await page.getByRole('button', { name: 'Analyze file' }).click()

  // Headers "Fecha/Concepto/Importe" don't match any known alias — nothing auto-detected
  await expect(page.getByLabel('Date column')).toHaveValue('')
  await expect(page.getByLabel('Payee column')).toHaveValue('')
  await expect(page.getByLabel('Amount column')).toHaveValue('')

  await page.getByLabel('Date column').selectOption({ label: 'Fecha' })
  await page.getByLabel('Payee column').selectOption({ label: 'Concepto' })
  await page.getByLabel('Amount column').selectOption({ label: 'Importe' })
  await page.getByLabel('Date format').selectOption('%d/%m/%Y')

  await page.getByRole('button', { name: 'Preview' }).click()

  const row = page.locator('tbody tr').filter({ hasText: 'E2E Custom Header Payee' })
  await expect(row.getByText('Needs category')).toBeVisible()

  // Assigning a category via the row's own selector resolves it to "ok" and is
  // reflected in what gets committed (not a commit blocker either way — only
  // a row-level parse error blocks commit, see the row-level error test below).
  await row.getByRole('combobox').nth(1).selectOption({ label: 'Groceries' })
  await page.getByRole('button', { name: 'Commit 1 transaction(s)' }).click()
  await expect(page.getByText('Imported 1 transaction(s).')).toBeVisible()
})

test('row-level parse error blocks commit until unchecked', async ({ page }) => {
  await page.goto('/?view=import')

  await page.getByLabel('CSV or QIF file').setInputFiles(fixture('sample-import-error-row.csv'))
  await page.getByRole('combobox').filter({ hasText: 'Default account' }).selectOption({ label: 'Joint Checking' })
  await page.getByRole('button', { name: 'Analyze file' }).click()
  await page.getByRole('button', { name: 'Preview' }).click()

  // The failed row's payee/date are dropped by the backend on a parse error
  // (only row_number/account/status/error_message survive), so it renders as
  // "—" rather than by its payee text — identify it by position instead.
  const badRow = page.locator('tbody tr').nth(0)
  const goodRow = page.locator('tbody tr').filter({ hasText: 'E2E Good Row' })
  await expect(badRow.getByText(/^Error:/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Commit \d+ transaction/ })).toBeDisabled()

  // Uncheck the bad row so it's excluded from the commit
  await badRow.getByRole('checkbox').uncheck()
  await goodRow.getByRole('combobox').nth(1).selectOption({ label: 'Groceries' })

  await page.getByRole('button', { name: 'Commit 1 transaction(s)' }).click()
  await expect(page.getByText('Imported 1 transaction(s).')).toBeVisible()
})

test('QIF file: records are read as Date/Payee/Amount/Memo/Category and imported', async ({ page }) => {
  await page.goto('/?view=import')

  await page.getByLabel('CSV or QIF file').setInputFiles(fixture('sample-import.qif'))
  await page.getByRole('combobox').filter({ hasText: 'Default account' }).selectOption({ label: 'Joint Checking' })
  await page.getByRole('button', { name: 'Analyze file' }).click()

  await expect(page.getByText(/QIF file: its records are read as/)).toBeVisible()
  await expect(page.getByLabel('Date column')).toHaveValue('Date')
  await expect(page.getByLabel('Payee column')).toHaveValue('Payee')
  await expect(page.getByLabel('Amount column')).toHaveValue('Amount')
  await expect(page.getByLabel('Category column (optional)')).toHaveValue('Category')

  await page.getByRole('button', { name: 'Preview' }).click()

  const bakeryRow = page.locator('tbody tr').filter({ hasText: 'E2E QIF Bakery' })
  const clientRow = page.locator('tbody tr').filter({ hasText: 'E2E QIF Client' })
  await expect(bakeryRow.getByText('OK', { exact: true })).toBeVisible()
  await expect(clientRow.getByText('OK', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Commit 2 transaction(s)' }).click()
  await expect(page.getByText('Imported 2 transaction(s).')).toBeVisible()
})
