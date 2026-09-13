import { test, expect } from './fixtures'
import { confirmDialog, expectToast, gotoView, tableRow, unique, userFilter } from './helpers'

test.beforeEach(async ({ app: page }) => {
  await gotoView(page, 'Users')
})

test.describe('users', () => {
  test('lists the seeded users', async ({ app: page }) => {
    await expect(tableRow(page, 'Alice')).toContainText('alice@example.com')
    await expect(tableRow(page, 'Bob')).toContainText('bob@example.com')
  })

  test('creates a user, who appears everywhere a user can be picked', async ({ app: page }) => {
    const name = unique('Carol')
    await page.getByRole('button', { name: '+ New User', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Email').fill('carol@example.com')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(tableRow(page, name)).toBeVisible()
    // The header selector is refetched on the next load.
    await page.reload()
    await expect(userFilter(page).getByRole('option', { name, exact: true })).toHaveCount(1)

    // POST /api/users seeds the global weight tier, which is what guarantees the
    // cascade always has a non-empty floor to fall back on.
    await gotoView(page, 'Split Weights')
    // Scoped to a <span>: the header user selector renders the same name in an
    // <option>, which getByText would also match.
    await expect(page.locator('span').filter({ hasText: name })).toBeVisible()
  })

  test('requires a name', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ New User', exact: true }).click()
    await page.getByPlaceholder('Email').fill('nobody@example.com')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expectToast(page, 'Name is required')
  })

  test('edits a user', async ({ app: page }) => {
    await tableRow(page, 'Bob').getByRole('button', { name: 'Edit', exact: true }).click()
    // Edit-mode inputs have neither a placeholder nor a type; only one row can
    // be editing, so the email is simply the second input in the body.
    await page.locator('tbody input').nth(1).fill('bob.new@example.com')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await page.reload()
    await expect(tableRow(page, 'Bob')).toContainText('bob.new@example.com')
  })

  test('clicking a name applies the global user filter', async ({ app: page }) => {
    await tableRow(page, 'Bob').getByTitle('Filter by this user').click()

    await expect(page.getByText('Filtering by:')).toContainText('Bob')
    await expect(userFilter(page)).toHaveValue('2')
  })

  test('refuses to delete a user who still owns an account', async ({ app: page }) => {
    await tableRow(page, 'Alice').getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete user')

    await expectToast(page, /account/i)
    await expect(tableRow(page, 'Alice')).toBeVisible()
  })

  test('deletes a user who owns nothing', async ({ app: page }) => {
    const name = unique('Dave')
    await page.getByRole('button', { name: '+ New User', exact: true }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(tableRow(page, name)).toBeVisible()

    await tableRow(page, name).getByRole('button', { name: 'Delete', exact: true }).click()
    await confirmDialog(page, 'Delete user')

    await expect(tableRow(page, name)).toHaveCount(0)
    await page.reload()
    await expect(tableRow(page, name)).toHaveCount(0)
  })
})
