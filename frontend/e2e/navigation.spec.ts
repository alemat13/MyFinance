import { test, expect } from './fixtures'
import { gotoView, userFilter, ViewLabel } from './helpers'

test.describe('app shell', () => {
  test('first launch forces a user choice, then remembers it', async ({ freshApp: page }) => {
    // The prompt has no title, so the dialog has no accessible name.
    const prompt = page.getByRole('dialog')
    await expect(prompt).toBeVisible()
    await expect(prompt.getByRole('heading', { name: "Who's using MyFinance?" })).toBeVisible()

    // Navigation is locked until a user is picked.
    await expect(page.getByRole('button', { name: 'Settings' })).toBeDisabled()

    await prompt.getByRole('button', { name: 'Alice' }).click()
    await expect(prompt).toBeHidden()
    await expect(page.getByRole('button', { name: 'Settings' })).toBeEnabled()
    await expect(page.getByText('Filtering by:')).toContainText('Alice')

    await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Filtering by:')).toContainText('Alice')
  })

  test('every view is reachable and mirrored into the URL', async ({ app: page }) => {
    const views: [ViewLabel, string][] = [
      ['Accounts', 'view=accounts'],
      ['Categories', 'view=categories'],
      ['Transactions', 'view=transactions'],
      ['Users', 'view=users'],
      ['Split Weights', 'view=split-settings'],
      ['Import CSV', 'view=import'],
      ['Backup & Restore', 'view=backup'],
      ['Charts', 'view=charts'],
      ['Help', 'view=help'],
    ]
    for (const [label, param] of views) {
      await gotoView(page, label)
      expect(page.url()).toContain(param)
    }
    // Dashboard clears the param instead of setting one.
    await gotoView(page, 'Dashboard')
    expect(page.url()).not.toContain('view=')
  })

  test('a view can be deep-linked', async ({ app: page }) => {
    await page.goto('/?view=accounts')
    await expect(page.getByRole('heading', { name: 'Accounts', level: 2 })).toBeVisible()
  })

  test('the user filter can be changed and cleared', async ({ app: page }) => {
    await userFilter(page).selectOption({ label: 'Bob' })
    await expect(page.getByText('Filtering by:')).toContainText('Bob')

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByText('Filtering by:')).toHaveCount(0)
    await expect(userFilter(page)).toHaveValue('')
  })

  test('the theme toggle persists across reloads', async ({ app: page }) => {
    await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible()
  })
})
