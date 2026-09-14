import { test as base } from '@playwright/test'

// Auto-fixture: every test gets a page that already looks like a returning
// user (bypasses the non-dismissable "Who's using MyFinance?" first-launch
// modal) before its first navigation, without repeating this in every spec.
// Deliberately does NOT set selectedUserId: that key drives the nav's
// "Filtering by: <user>" selector, and a specific user filters every list to
// that user's owned accounts — a freshly created account/transaction has no
// owners yet, so it would be invisible. Leaving it unset keeps the default
// "All Users" (unfiltered) view, matching what every test here needs.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('userChoiceMade', '1')
    })
    await use(page)
  },
})

export { expect } from '@playwright/test'
