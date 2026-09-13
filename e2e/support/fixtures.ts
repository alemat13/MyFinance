import { test as base } from '@playwright/test'

// Auto-fixture: every test gets a page that already looks like a returning
// user (bypasses the non-dismissable "Who's using MyFinance?" first-launch
// modal) before its first navigation, without repeating this in every spec.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('userChoiceMade', '1')
      window.localStorage.setItem('selectedUserId', '1')
    })
    await use(page)
  },
})

export { expect } from '@playwright/test'
