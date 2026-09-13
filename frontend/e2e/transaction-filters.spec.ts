import { test, expect } from './fixtures'
import { categoryPicker, gotoView, pickCategory, selectByOption, tableRow } from './helpers'
import type { Locator, Page } from '@playwright/test'

/** The value box of an advanced condition — it carries no placeholder. */
const conditionValue = (page: Page): Locator => page.locator('input[type="text"]')

test.beforeEach(async ({ app: page }) => {
  await gotoView(page, 'Transactions')
  await expect(page.getByText('18 results')).toBeVisible()
})

test.describe('simple filters', () => {
  test('searches payee and memo', async ({ app: page }) => {
    // The search is debounced by 300ms; asserting the outcome lets Playwright's
    // retries absorb it, so no waitForTimeout is needed.
    await page.getByPlaceholder('Search payee/memo').fill('Sushi')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()
    await expect(tableRow(page, 'Sushi Place')).toBeVisible()
  })

  test('filters by date range', async ({ app: page }) => {
    // The two date filters are unlabelled and positional. Settling on the
    // intermediate result keeps the second fill from racing the re-render the
    // first one triggers.
    const dates = page.locator('input[type="date"]')
    await dates.first().fill('2026-01-01')
    await expect(page.getByText('18 results')).toBeVisible()
    await dates.nth(1).fill('2026-01-31')

    await expect(page.getByText('6 results')).toBeVisible()
    await expect(tableRow(page, 'Sushi Place')).toHaveCount(0)
  })

  test('filters by account', async ({ app: page }) => {
    await selectByOption(page, 'Account').selectOption({ label: 'Personal Savings' })

    await expect(page.getByText('3 results')).toBeVisible()
    await expect(tableRow(page, 'Freelance Project Alpha')).toBeVisible()
    await expect(tableRow(page, 'Whole Foods')).toHaveCount(0)
  })

  test('filters by category, including a subcategory', async ({ app: page }) => {
    // Rent is a child of Housing; the picker's search reaches it without
    // expanding the parent.
    await pickCategory(categoryPicker(page), 'Rent', 'Category')
    await expect(page.getByText('4 results')).toBeVisible()
    await expect(tableRow(page, 'Sunset Properties').first()).toBeVisible()

    await pickCategory(categoryPicker(page), null, 'Category')
    await expect(page.getByText('18 results')).toBeVisible()
  })

  test('filters by amount range', async ({ app: page }) => {
    // Signed comparison, not absolute value: only the four salary rows and the
    // €1,500 freelance invoice are >= 1000.
    await page.getByPlaceholder('Min amount').fill('1000')
    await expect(page.getByText('5 results')).toBeVisible()

    await page.getByPlaceholder('Max amount').fill('2000')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()
    await expect(tableRow(page, 'Freelance Project Beta')).toBeVisible()
  })

  test('clears every filter at once', async ({ app: page }) => {
    await page.getByPlaceholder('Search payee/memo').fill('Sushi')
    // Sushi Place is on Joint Checking, so filtering to the other account
    // leaves nothing.
    await selectByOption(page, 'Account').selectOption({ label: 'Personal Savings' })
    await expect(page.getByText('0 results')).toBeVisible()

    // The "Filtering by: Alice" banner has a Clear button too; the filter bar's
    // is the later of the two in the DOM.
    await page.getByRole('button', { name: 'Clear', exact: true }).last().click()

    await expect(page.getByText('18 results')).toBeVisible()
    await expect(page.getByPlaceholder('Search payee/memo')).toHaveValue('')
    expect(page.url()).not.toContain('account_id=')
  })

  test('survives a reload through the URL', async ({ app: page }) => {
    await page.getByPlaceholder('Search payee/memo').fill('Sushi')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByPlaceholder('Search payee/memo')).toHaveValue('Sushi')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()
  })
})

test.describe('advanced filters', () => {
  test.beforeEach(async ({ app: page }) => {
    await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    await expect(page.getByText('No conditions yet — add one to filter.')).toBeVisible()
  })

  test('filters on a single condition', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ Add condition', exact: true }).click()
    await selectByOption(page, 'Payee').selectOption('payee')
    await selectByOption(page, 'contains').selectOption('contains')
    // The condition's value input has no placeholder; in advanced mode it is
    // the only text input on the page.
    await conditionValue(page).fill('Freelance')

    await expect(page.getByText('2 results')).toBeVisible()
  })

  test('combines two conditions with ANY (OR)', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ Add condition', exact: true }).click()
    await conditionValue(page).first().fill('Sushi')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '+ Add condition', exact: true }).click()
    await conditionValue(page).nth(1).fill('Costo')

    // ALL (AND) can't match both payees at once.
    await expect(page.getByText('0 results')).toBeVisible()
    await selectByOption(page, 'ALL (AND)').selectOption('any')
    await expect(page.getByText('2 results')).toBeVisible()
  })

  test('removes a condition', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ Add condition', exact: true }).click()
    await conditionValue(page).fill('Sushi')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '×', exact: true }).click()
    await expect(page.getByText('No conditions yet — add one to filter.')).toBeVisible()
    await expect(page.getByText('18 results')).toBeVisible()
  })
})
