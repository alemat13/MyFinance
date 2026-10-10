import { Locator, Page } from '@playwright/test'

/** Picks an account in an AccountPicker: opens it by its trigger's current text,
 *  searches for the name (collapsed sub-menus don't render their accounts) and
 *  clicks it. */
export async function pickAccount(scope: Page | Locator, triggerText: string, account: string) {
  await scope.getByRole('button', { name: triggerText, exact: true }).click()
  await scope.getByLabel('Search accounts').fill(account)
  await scope.getByRole('listbox', { name: 'Accounts' }).getByRole('option', { name: account, exact: true }).click()
}
