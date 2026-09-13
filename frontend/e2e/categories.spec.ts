import { test, expect } from './fixtures'
import {
  addSplitRow, confirmDialog, expectToast, gotoView, selectByOption,
  splitEditor, splitRowValue, tableRow, unique,
} from './helpers'

const SPLIT = /^Default Split Weight \(highest priority/

test.beforeEach(async ({ app: page }) => {
  await gotoView(page, 'Categories')
})

test.describe('categories', () => {
  test('groups subcategories under their parent behind a chevron', async ({ app: page }) => {
    const housing = tableRow(page, 'Housing')
    await expect(housing).toContainText('2 subcategories')
    // Children are collapsed by default.
    await expect(tableRow(page, 'Home Insurance')).toHaveCount(0)

    await housing.getByTitle('Expand').click()
    await expect(tableRow(page, 'Home Insurance')).toBeVisible()
    await expect(tableRow(page, 'Rent')).toBeVisible()
    await expect(page.getByRole('button', { name: '+ Add subcategory', exact: true })).toBeVisible()

    await housing.getByTitle('Collapse').click()
    await expect(tableRow(page, 'Home Insurance')).toHaveCount(0)
  })

  test('creates a top-level category', async ({ app: page }) => {
    const name = unique('E2E Category')
    await page.getByRole('button', { name: '+ New Category', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type (Income / Expense / Transfer)').fill('Expense')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    const row = tableRow(page, name)
    await expect(row).toContainText('Expense')
    await expect(row).toContainText('— (uses account/global default)')
  })

  test('creates a subcategory with the parent prefilled and the type locked', async ({ app: page }) => {
    const name = unique('E2E Sub')
    await tableRow(page, 'Housing').getByTitle('Expand').click()
    await page.getByRole('button', { name: '+ Add subcategory', exact: true }).click()

    // "+ Add subcategory" pre-selects Housing, which forces the child's type.
    await expect(selectByOption(page, 'None (top-level category)')).toHaveValue(/\d+/)
    const typeInput = page.getByPlaceholder('Type (Income / Expense / Transfer)')
    await expect(typeInput).toBeDisabled()
    await expect(typeInput).toHaveValue('Expense')

    await page.getByPlaceholder('Name').fill(name)
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(tableRow(page, 'Housing')).toContainText('3 subcategories')
    await expect(tableRow(page, name)).toBeVisible()
  })

  test('requires a name and a type', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ New Category', exact: true }).click()
    await page.getByPlaceholder('Name').fill('No type given')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expectToast(page, 'Name and type are required')
  })

  test('sets a default split weight, the highest-priority tier', async ({ app: page }) => {
    await tableRow(page, 'Groceries').getByRole('button', { name: 'Edit', exact: true }).click()
    const editor = splitEditor(page, SPLIT)
    await addSplitRow(editor, 'Alice', 2)
    await addSplitRow(editor, 'Bob', 1)
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(tableRow(page, 'Groceries')).toContainText('Alice: 2, Bob: 1')

    await page.reload()
    await tableRow(page, 'Groceries').getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(splitRowValue(splitEditor(page, SPLIT), 0)).toHaveValue('2')
  })

  test('locks the parent selector on a category that has subcategories', async ({ app: page }) => {
    await tableRow(page, 'Housing').getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(selectByOption(page, 'None (top-level)')).toBeDisabled()
    await expect(page.getByText("Has subcategories — can't set a parent")).toBeVisible()
  })

  test('refuses to delete a category that still has transactions', async ({ app: page }) => {
    await tableRow(page, 'Housing').getByTitle('Expand').click()
    await tableRow(page, 'Rent').getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete category')

    await expectToast(page, /transaction/i)
    await expect(tableRow(page, 'Rent')).toBeVisible()
  })

  test('refuses to delete a category that still has subcategories', async ({ app: page }) => {
    await tableRow(page, 'Housing').getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete category')

    await expectToast(page, /subcategor/i)
    await expect(tableRow(page, 'Housing')).toBeVisible()
  })

  test('deletes an unused category', async ({ app: page }) => {
    const name = unique('E2E Doomed')
    await page.getByRole('button', { name: '+ New Category', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type (Income / Expense / Transfer)').fill('Expense')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(tableRow(page, name)).toBeVisible()

    await tableRow(page, name).getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete category')

    await expect(tableRow(page, name)).toHaveCount(0)
  })
})
