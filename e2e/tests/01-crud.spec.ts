import { test, expect } from '../support/fixtures'

test.describe('Accounts CRUD', () => {
  test('create, edit, archive/unarchive, and delete an account', async ({ page }) => {
    const name = `E2E Account ${Date.now()}`
    const renamed = `${name} Renamed`

    await page.goto('/?view=accounts')

    await page.getByRole('button', { name: '+ New Account' }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Type').fill('Checking')
    await page.getByPlaceholder('Balance').fill('100')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    const row = page.locator('tbody tr').filter({ hasText: name })
    await expect(row).toBeVisible()
    await expect(row).toContainText('Checking')

    // Edit
    await row.getByRole('button', { name: 'Edit' }).click()
    const editRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Save', exact: true }) })
    await editRow.getByRole('textbox').first().fill(renamed)
    await editRow.getByRole('button', { name: 'Save', exact: true }).click()
    const renamedRow = page.locator('tbody tr').filter({ hasText: renamed })
    await expect(renamedRow).toBeVisible()

    // Archive hides it from the default (non-"Show archived") view
    await renamedRow.getByRole('button', { name: 'Archive' }).click()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toHaveCount(0)

    await page.getByLabel('Show archived').check()
    const archivedRow = page.locator('tbody tr').filter({ hasText: renamed })
    await expect(archivedRow).toContainText('Archived')

    await archivedRow.getByRole('button', { name: 'Unarchive' }).click()
    await page.getByLabel('Show archived').uncheck()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toBeVisible()

    // Delete — cancel first, then confirm
    const finalRow = page.locator('tbody tr').filter({ hasText: renamed })
    await finalRow.getByRole('button', { name: 'Delete' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete account' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toBeVisible()

    await finalRow.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toHaveCount(0)
  })
})

test.describe('Categories CRUD', () => {
  test('create a category, a subcategory under it, edit, and delete both', async ({ page }) => {
    const parentName = `E2E Parent ${Date.now()}`
    const childName = `E2E Child ${Date.now()}`
    const renamed = `${parentName} Renamed`

    await page.goto('/?view=categories')

    // Create top-level category
    await page.getByRole('button', { name: '+ New Category' }).click()
    await page.getByPlaceholder('Name').fill(parentName)
    await page.getByPlaceholder('Type (Income / Expense / Transfer)').fill('Expense')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('tbody tr').filter({ hasText: parentName })).toBeVisible()

    // Create a subcategory under it via the "Parent category" selector on the new-category form
    await page.getByRole('button', { name: '+ New Category' }).click()
    await page.getByPlaceholder('Name').fill(childName)
    // Scoped by its default option text: the page also has an always-present
    // nav "Filtering by user" <select>, which is a combobox too.
    await page.getByRole('combobox').filter({ hasText: 'None (top-level category)' }).selectOption({ label: parentName })
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // Parent row now has children — expand it to see the subcategory
    const parentRow = page.locator('tbody tr').filter({ hasText: parentName }).first()
    await expect(parentRow).toContainText('1 subcategories')
    await parentRow.getByTitle('Expand').click()
    await expect(page.locator('tbody tr').filter({ hasText: childName })).toBeVisible()

    // Edit the parent's name
    await parentRow.getByRole('button', { name: 'Edit' }).click()
    const editRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Save', exact: true }) }).first()
    await editRow.getByRole('textbox').first().fill(renamed)
    await editRow.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toBeVisible()

    // Delete the child first (parent has a subcategory, deleting it would 409), then the parent
    const childRow = page.locator('tbody tr').filter({ hasText: childName })
    await childRow.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(page.locator('tbody tr').filter({ hasText: childName })).toHaveCount(0)

    const renamedParentRow = page.locator('tbody tr').filter({ hasText: renamed })
    await renamedParentRow.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toHaveCount(0)
  })
})

test.describe('Users CRUD', () => {
  test('create, edit, and delete a user', async ({ page }) => {
    const name = `E2E User ${Date.now()}`
    const email = `e2e-${Date.now()}@example.com`
    const renamed = `${name} Renamed`

    await page.goto('/?view=users')

    await page.getByRole('button', { name: '+ New User' }).click()
    await page.getByPlaceholder('Name').fill(name)
    await page.getByPlaceholder('Email').fill(email)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('tbody tr').filter({ hasText: name })).toBeVisible()

    const row = page.locator('tbody tr').filter({ hasText: name })
    await row.getByRole('button', { name: 'Edit' }).click()
    const editRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Save', exact: true }) })
    await editRow.getByRole('textbox').first().fill(renamed)
    await editRow.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toBeVisible()

    const renamedRow = page.locator('tbody tr').filter({ hasText: renamed })
    await renamedRow.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(page.locator('tbody tr').filter({ hasText: renamed })).toHaveCount(0)
  })
})
