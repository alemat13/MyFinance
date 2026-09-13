import { test, expect } from './fixtures'
import {
  categoryPicker, confirmDialog, dialog, expectToast, gotoView, pickCategory,
  selectByOption, tableRow, unique,
} from './helpers'

test.beforeEach(async ({ app: page }) => {
  await gotoView(page, 'Transactions')
})

test.describe('transactions', () => {
  test('lists the seeded transactions', async ({ app: page }) => {
    await expect(page.getByText('18 results')).toBeVisible()
    const groceries = tableRow(page, 'Whole Foods')
    await expect(groceries).toContainText('-€120.50')
    await expect(groceries).toContainText('Joint Checking')
    await expect(groceries).toContainText('Groceries')
    // Rows are newest-first, so the April raise leads the four salary rows.
    await expect(tableRow(page, 'Acme Corp Salary').first()).toContainText('€5,450.00')
    await expect(tableRow(page, 'Acme Corp Salary')).toHaveCount(4)
    // Sushi Place is the one seeded transaction with no category.
    await expect(tableRow(page, 'Sushi Place')).toContainText('Uncategorized')
  })

  test('creates a transaction', async ({ app: page }) => {
    const payee = unique('E2E Payee')
    await page.getByRole('button', { name: '+ New Transaction', exact: true }).click()

    const modal = dialog(page, 'New Transaction')
    await expect(modal).toBeVisible()
    await modal.locator('input[type="date"]').fill('2026-06-15')
    await modal.getByPlaceholder('Payee').fill(payee)
    await modal.getByPlaceholder('Memo').fill('Created by Playwright')
    await modal.getByPlaceholder('Amount').fill('-42.50')
    await selectByOption(modal, 'Account').selectOption({ label: 'Joint Checking' })
    await pickCategory(categoryPicker(modal), 'Dining Out')
    await modal.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(modal).toBeHidden()
    await expect(page.getByText('19 results')).toBeVisible()
    const row = tableRow(page, payee)
    await expect(row).toContainText('-€42.50')
    await expect(row).toContainText('Dining Out')
  })

  test('requires a payee and an account', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ New Transaction', exact: true }).click()
    const modal = dialog(page, 'New Transaction')
    await modal.getByRole('button', { name: 'Save', exact: true }).click()

    await expectToast(page, 'Payee and account are required')
    await expect(modal).toBeVisible()
  })

  test('opens an existing transaction and is bookmarkable', async ({ app: page }) => {
    await tableRow(page, 'Whole Foods').click()

    const modal = dialog(page, 'Whole Foods')
    await expect(modal).toBeVisible()
    await expect(modal.getByPlaceholder('Amount')).toHaveValue('-120.5')
    await expect(page).toHaveURL(/[?&]transaction=\d+/)

    const bookmarked = page.url()
    await modal.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(modal).toBeHidden()

    await page.goto(bookmarked)
    await expect(dialog(page, 'Whole Foods')).toBeVisible()
  })

  test('edits a transaction and records it in the history', async ({ app: page }) => {
    await tableRow(page, 'Olive Garden').click()
    const modal = dialog(page, 'Olive Garden')

    // seed.py inserts through the ORM, bypassing the router that writes the
    // audit trail — so a seeded transaction starts with no history at all.
    await expect(modal.getByRole('heading', { name: 'History' })).toBeVisible()
    await expect(modal.getByText('No history recorded for this transaction')).toBeVisible()

    await modal.getByPlaceholder('Amount').fill('-72.25')
    await modal.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(modal).toBeHidden()
    await expect(tableRow(page, 'Olive Garden')).toContainText('-€72.25')

    await tableRow(page, 'Olive Garden').click()
    await expect(dialog(page, 'Olive Garden').getByText('updated', { exact: true })).toBeVisible()
  })

  test('deletes a transaction from its detail modal', async ({ app: page }) => {
    await tableRow(page, 'Sushi Place').click()
    await dialog(page, 'Sushi Place').getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete transaction')

    await expect(page.getByText('17 results')).toBeVisible()
    await expect(tableRow(page, 'Sushi Place')).toHaveCount(0)
  })

  test('toggles reconciliation from the row', async ({ app: page }) => {
    await page.getByRole('button', { name: 'Mark Whole Foods as reconciled', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Mark Whole Foods as unreconciled', exact: true })).toBeVisible()

    await selectByOption(page, 'Reconciled: any').selectOption('true')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()
    await expect(tableRow(page, 'Whole Foods')).toBeVisible()
  })

  test('paginates', async ({ app: page }) => {
    await expect(page.getByText('Page 1 / 1')).toBeVisible()

    await selectByOption(page, '25 / page').selectOption('25')
    await expect(page.getByText('Page 1 / 1')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prev', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await expect(page).toHaveURL(/page_size=25/)
  })

  test('selects rows in bulk and clears the selection', async ({ app: page }) => {
    await page.getByLabel('Select transaction Whole Foods').check()
    await expect(page.getByText('1 selected')).toBeVisible()

    await page.getByLabel('Select all on this page').check()
    await expect(page.getByText('18 selected')).toBeVisible()

    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
    await expect(page.getByText('selected')).toHaveCount(0)
  })

  test('bulk-edits the category of the selected rows', async ({ app: page }) => {
    await page.getByLabel('Select transaction Whole Foods').check()
    await page.getByLabel('Select transaction Costo').check()
    await page.getByRole('button', { name: 'Bulk Edit', exact: true }).click()

    const modal = dialog(page, 'Bulk Edit Transactions')
    await expect(modal).toContainText('2 transactions selected')
    await modal.getByLabel('Change category').check()
    await pickCategory(categoryPicker(modal), 'Utilities')
    await modal.getByRole('button', { name: 'Apply to 2 transactions', exact: true }).click()

    await expect(modal).toBeHidden()
    await expect(tableRow(page, 'Whole Foods')).toContainText('Utilities')
    await expect(tableRow(page, 'Costo')).toContainText('Utilities')
  })
})
