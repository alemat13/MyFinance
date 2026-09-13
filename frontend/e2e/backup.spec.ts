import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures'
import { confirmDialog, dialog, expectToast, gotoView, tableRow } from './helpers'
import { E2E_DATA_DIR } from './paths'

// The overwrite import wipes the whole database, so these run one after another;
// the per-test reseed in fixtures.ts puts the seed data back for the next one.
test.describe.configure({ mode: 'serial' })

test.describe('backup & restore', () => {
  test('exports a zip archive', async ({ app: page }, testInfo) => {
    await gotoView(page, 'Backup & Restore')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Backup', exact: true }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^myfinance-backup-.*\.zip$/)
    const saved = testInfo.outputPath('export.zip')
    await download.saveAs(saved)
    expect(fs.statSync(saved).size).toBeGreaterThan(0)
  })

  test('restores the database from an exported archive', async ({ app: page }, testInfo) => {
    await gotoView(page, 'Backup & Restore')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Backup', exact: true }).click(),
    ])
    const archive = testInfo.outputPath('roundtrip.zip')
    await download.saveAs(archive)

    // Destroy something the archive still holds.
    await gotoView(page, 'Transactions')
    await tableRow(page, 'Sushi Place').click()
    await dialog(page, 'Sushi Place').getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete transaction')
    await expect(page.getByText('17 results')).toBeVisible()

    await gotoView(page, 'Backup & Restore')
    await page.getByLabel('Backup file').setInputFiles(archive)
    await page.getByLabel('Import mode').selectOption('overwrite')
    await page.getByRole('button', { name: 'Import Backup', exact: true }).click()

    await expect(dialog(page, 'Overwrite all data')).toBeVisible()
    await dialog(page, 'Overwrite all data').getByRole('button', { name: 'Confirm import', exact: true }).click()

    await expectToast(page, 'Imported 2 user(s), 2 account(s), 9 category(ies), 18 transaction(s).')

    await gotoView(page, 'Transactions')
    await expect(page.getByText('18 results')).toBeVisible()
    await expect(tableRow(page, 'Sushi Place')).toBeVisible()
  })

  test('warns before appending instead of overwriting', async ({ app: page }, testInfo) => {
    await gotoView(page, 'Backup & Restore')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Backup', exact: true }).click(),
    ])
    const archive = testInfo.outputPath('append.zip')
    await download.saveAs(archive)

    await page.getByLabel('Backup file').setInputFiles(archive)
    await page.getByLabel('Import mode').selectOption('append')
    await page.getByRole('button', { name: 'Import Backup', exact: true }).click()

    const confirm = dialog(page, 'Append backup data')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('conflict error')
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(confirm).toBeHidden()
  })

  test('rejects a file that is not a zip archive', async ({ app: page }) => {
    await gotoView(page, 'Backup & Restore')
    await page.getByLabel('Backup file').setInputFiles(path.join(E2E_DATA_DIR, 'import-sample.csv'))
    await page.getByRole('button', { name: 'Import Backup', exact: true }).click()
    await dialog(page, 'Overwrite all data').getByRole('button', { name: 'Confirm import', exact: true }).click()

    await expectToast(page, /zip/i)
  })
})
