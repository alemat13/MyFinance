import { test, expect } from './fixtures'
import {
  addSplitRow, confirmDialog, expectToast, gotoView, selectByOption,
  splitEditor, splitRowUser, splitRowValue, tableRow, unique,
} from './helpers'

const OWNERS = 'Owners'
const WEIGHTS = /^Split Weight \(optional/

test.beforeEach(async ({ app: page }) => {
  await gotoView(page, 'Accounts')
})

test.describe('accounts', () => {
  test('lists the seeded accounts with balances and owners', async ({ app: page }) => {
    const joint = tableRow(page, 'Joint Checking')
    await expect(joint).toContainText('Checking')
    await expect(joint).toContainText('€5,420.00')
    await expect(joint).toContainText('Alice (50%)')
    await expect(joint).toContainText('Bob (50%)')

    await expect(tableRow(page, 'Personal Savings')).toContainText('$12,800.00')
  })

  test('creates an account with owners and a split-weight tier', async ({ app: page }) => {
    const name = unique('E2E Account')
    await page.getByRole('button', { name: '+ New Account', exact: true }).click()

    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type').fill('Checking')
    await page.getByPlaceholder('Balance').fill('250.75')

    await addSplitRow(splitEditor(page, OWNERS), 'Alice', 60)
    await addSplitRow(splitEditor(page, OWNERS), 'Bob', 40)
    await addSplitRow(splitEditor(page, WEIGHTS), 'Alice', 3)
    await addSplitRow(splitEditor(page, WEIGHTS), 'Bob', 1)

    await page.getByRole('button', { name: 'Save', exact: true }).click()

    const row = tableRow(page, name)
    await expect(row).toBeVisible()
    await expect(row).toContainText('Checking')
    await expect(row).toContainText('Alice (60%)')
    await expect(row).toContainText('Bob (40%)')

    // Reopening the edit form proves the weight tier reached its own endpoint.
    await page.reload()
    await tableRow(page, name).getByRole('button', { name: 'Edit', exact: true }).click()
    const weights = splitEditor(page, WEIGHTS)
    await expect(splitRowValue(weights, 0)).toHaveValue('3')
    await expect(splitRowValue(weights, 1)).toHaveValue('1')
  })

  test('supports a currency outside the curated list', async ({ app: page }) => {
    const name = unique('E2E Krona')
    await page.getByRole('button', { name: '+ New Account', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type').fill('Savings')
    await selectByOption(page, 'Other…').selectOption('other')
    await page.getByPlaceholder('Code').fill('sek')
    await addSplitRow(splitEditor(page, OWNERS), 'Alice', 100)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(tableRow(page, name)).toContainText('SEK')
  })

  test('rejects ownership percentages that do not sum to 100', async ({ app: page }) => {
    const name = unique('E2E Bad Owners')
    await page.getByRole('button', { name: '+ New Account', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type').fill('Savings')
    await addSplitRow(splitEditor(page, OWNERS), 'Alice', 60)
    await addSplitRow(splitEditor(page, OWNERS), 'Bob', 30)

    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expectToast(page, 'Ownership percentages must sum to 100')
    await expect(tableRow(page, name)).toHaveCount(0)
  })

  test('requires a name and a type', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ New Account', exact: true }).click()
    await page.getByPlaceholder('Name').fill('No type given')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expectToast(page, 'Name and type are required')
  })

  test('rejects a split-weight tier that is all zeroes', async ({ app: page }) => {
    const name = unique('E2E Zero Weights')
    await page.getByRole('button', { name: '+ New Account', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type').fill('Checking')
    await addSplitRow(splitEditor(page, OWNERS), 'Alice', 100)
    await addSplitRow(splitEditor(page, WEIGHTS), 'Alice', 0)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expectToast(page, 'At least one split weight must be greater than 0')
  })

  test('renames an existing account', async ({ app: page }) => {
    const renamed = unique('Renamed Checking')
    await tableRow(page, 'Joint Checking').getByRole('button', { name: 'Edit', exact: true }).click()

    // Only one row can be in edit mode, and edit inputs carry no placeholder —
    // the name is simply the first text input on the page.
    // The shared Input primitive sets no `type`, so `input[type="text"]` misses it.
    await page.locator('tbody input:not([type])').first().fill(renamed)
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await page.reload()
    await expect(tableRow(page, renamed)).toBeVisible()
    await expect(tableRow(page, 'Joint Checking')).toHaveCount(0)
  })

  test('changes ownership percentages from the edit form', async ({ app: page }) => {
    await tableRow(page, 'Joint Checking').getByRole('button', { name: 'Edit', exact: true }).click()

    const owners = splitEditor(page, OWNERS)
    await expect(splitRowUser(owners, 0)).toHaveValue('1')
    await splitRowValue(owners, 0).fill('70')
    await splitRowValue(owners, 1).fill('30')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await page.reload()
    await expect(tableRow(page, 'Joint Checking')).toContainText('Alice (70%), Bob (30%)')
  })

  test('archives and unarchives an account', async ({ app: page }) => {
    await tableRow(page, 'Personal Savings').getByRole('button', { name: 'Archive', exact: true }).click()

    // Archived accounts are hidden until "Show archived" is ticked.
    await expect(tableRow(page, 'Personal Savings')).toHaveCount(0)
    await page.getByLabel('Show archived').check()

    const archived = tableRow(page, 'Personal Savings')
    await expect(archived).toContainText('Archived')
    await archived.getByRole('button', { name: 'Unarchive', exact: true }).click()

    await page.getByLabel('Show archived').uncheck()
    await expect(tableRow(page, 'Personal Savings')).toBeVisible()
  })

  test('refuses to delete an account that still has transactions', async ({ app: page }) => {
    await tableRow(page, 'Joint Checking').getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete account')

    await expectToast(page, /transaction/i)
    await expect(tableRow(page, 'Joint Checking')).toBeVisible()
  })

  test('deletes an account with no transactions', async ({ app: page }) => {
    const name = unique('E2E Disposable')
    await page.getByRole('button', { name: '+ New Account', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type').fill('Cash')
    await addSplitRow(splitEditor(page, OWNERS), 'Alice', 100)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(tableRow(page, name)).toBeVisible()

    await tableRow(page, name).getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete account')

    await expect(tableRow(page, name)).toHaveCount(0)
    await page.reload()
    await expect(tableRow(page, name)).toHaveCount(0)
  })
})
