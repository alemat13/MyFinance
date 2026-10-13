import { test, expect } from '../support/fixtures'

// Runs last (filename order under workers: 1 / fullyParallel: false) since
// "Overwrite all data" is a genuinely destructive whole-DB replace.

async function createAccount(page: import('@playwright/test').Page, name: string) {
  await page.goto('/?view=accounts')
  await page.getByRole('button', { name: '+ New Account' }).click()
  await page.getByPlaceholder('Name').fill(name)
  await page.getByPlaceholder('Type').fill('Checking')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('tbody tr').filter({ hasText: name })).toBeVisible()
}

test('export, overwrite-restore, and partial restore (admin mode)', async ({ page }) => {
  const markerName = `E2E Backup Marker ${Date.now()}`
  const throwawayName = `E2E Throwaway ${Date.now()}`

  await createAccount(page, markerName)

  // Export a backup that includes the marker account
  await page.goto('/?view=backup')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Backup' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^myfinance-backup-.*\.zip$/)
  const backupPath = await download.path()
  expect(backupPath).toBeTruthy()

  // Create a throwaway account *after* the export, so overwrite-restore is
  // observable: the export doesn't know about it.
  await createAccount(page, throwawayName)

  // Restoring is admin mode only.
  await page.goto('/?view=backup')
  await expect(page.getByRole('button', { name: 'Import Backup' })).toHaveCount(0)

  // Import in "Overwrite all data" mode (default)
  await page.goto('/?view=backup&admin')
  await page.getByLabel('Backup file').setInputFiles(backupPath!)
  await page.getByRole('button', { name: 'Import Backup' }).click()
  const overwriteDialog = page.getByRole('dialog', { name: 'Overwrite all data' })
  await expect(overwriteDialog).toBeVisible()
  await overwriteDialog.getByRole('button', { name: 'Confirm import' }).click()
  await expect(page.getByRole('alert')).toContainText('Imported')

  await page.goto('/?view=accounts')
  await expect(page.locator('tbody tr').filter({ hasText: markerName })).toBeVisible()
  await expect(page.locator('tbody tr').filter({ hasText: throwawayName })).toHaveCount(0)

  // A partial restore of the same backup appends a second copy of its
  // accounts under new ids, next to what the overwrite restored.
  await page.goto('/?view=backup&admin')
  await page.getByLabel('Backup file').setInputFiles(backupPath!)
  await page.getByLabel('Import mode').selectOption('partial')
  await page.getByRole('button', { name: 'Import Backup' }).click()
  const partialDialog = page.getByRole('dialog', { name: 'Partial restore' })
  await expect(partialDialog).toBeVisible()
  await partialDialog.getByRole('button', { name: 'Confirm import' }).click()
  await expect(page.getByRole('alert')).toContainText('Added')

  await page.goto('/?view=accounts')
  await expect(page.locator('tbody tr').filter({ hasText: markerName })).toHaveCount(2)
})
