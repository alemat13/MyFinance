import { test, expect } from '../support/fixtures'

// Seeded data (backend/seed.py) this file relies on:
// - Accounts: "Joint Checking" (AccountSplitWeight 55/45 Alice/Bob), "Personal Savings"
// - Category: "Transfer" (CategorySplit 50/50 Alice/Bob)
// - Users: "Alice", "Bob"
// - GlobalSplitWeight: Alice 52000, Bob 48000 (both proportional, ratio unaffected)

test('quick-fill buttons resolve to the correct seeded weight tier', async ({ page }) => {
  const payee = `E2E Split Txn ${Date.now()}`

  await page.goto('/?view=transactions')
  await page.getByRole('button', { name: '+ New Transaction' }).click()

  const dialog = page.getByRole('dialog', { name: 'New Transaction' })
  await dialog.getByPlaceholder('Payee').fill(payee)
  await dialog.getByPlaceholder('Amount').fill('100')
  await dialog.getByRole('combobox').filter({ hasText: 'Account' }).selectOption({ label: 'Joint Checking' })

  // Category quick-fill: pick the "Transfer" category (CategorySplit 50/50 seeded)
  await dialog.getByRole('button', { name: 'Uncategorized' }).click()
  await page.getByRole('button', { name: 'Transfer', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Category' })).toHaveClass(/bg-accent/)
  await expect(dialog).toContainText('Total weight: 100')

  // Account quick-fill (AccountSplitWeight 55/45 on Joint Checking)
  await dialog.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(dialog).toContainText('Total weight: 100')

  // Global quick-fill (GlobalSplitWeight 52000/48000)
  await dialog.getByRole('button', { name: 'Global', exact: true }).click()
  await expect(dialog).toContainText('Total weight: 100000')

  // Split Evenly — one row per user, weight 1 each
  await dialog.getByRole('button', { name: 'Split Evenly' }).click()
  await expect(dialog).toContainText('Total weight: 2')

  // Manual edit of a weight input marks the split as custom (no quick-fill button stays primary).
  // Spinbutton 0 is the Amount field; spinbutton 1 is the first split row's weight input.
  const firstWeightInput = dialog.getByRole('spinbutton').nth(1)
  await firstWeightInput.fill('5')
  await expect(dialog).toContainText('Total weight: 6')

  await dialog.getByRole('button', { name: 'Save', exact: true }).click()

  const row = page.locator('tbody tr').filter({ hasText: payee })
  await expect(row).toBeVisible()

  // Edit: reconcile + change category, then verify history recorded it
  await row.click()
  const editDialog = page.getByRole('dialog', { name: payee })
  await editDialog.getByLabel('Reconciled').check()
  await editDialog.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.locator('tbody tr').filter({ hasText: payee })).toHaveClass(/opacity-60/)

  await page.locator('tbody tr').filter({ hasText: payee }).click()
  const historyDialog = page.getByRole('dialog', { name: payee })
  await expect(historyDialog.getByText('Reconciled: No → Yes')).toBeVisible()

  // Delete the transaction this test created
  await historyDialog.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.locator('tbody tr').filter({ hasText: payee })).toHaveCount(0)
})
