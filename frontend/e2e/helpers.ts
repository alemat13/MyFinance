import { expect, Locator, Page } from '@playwright/test'

/*
 * Locator conventions for this suite:
 *  - `getByRole(..., { name })` matches accessible names as a *substring* by
 *    default, so short labels ('Save', 'Delete', 'Account') always pass
 *    `exact: true` — otherwise 'Delete' also matches 'Confirm delete'.
 *  - Anything inside a modal is scoped through `dialog()`; the Transactions
 *    screen repeats 'Account', 'Category', 'Save' and 'Cancel' behind it.
 *  - Prefer role / label / placeholder / text. The only `data-testid`s in the
 *    app mark two role-less composite widgets that render several times per
 *    screen (SplitEditor, CategoryPicker).
 */

/** The nav-menu entries rendered by `viewLabels` in src/App.tsx. */
export type ViewLabel =
  | 'Dashboard' | 'Accounts' | 'Categories' | 'Transactions' | 'Users'
  | 'Split Weights' | 'Import CSV' | 'Backup & Restore' | 'Charts' | 'Help'

/** Dashboard is the one view whose <h2> isn't its own menu label. */
const VIEW_HEADINGS: Record<ViewLabel, string> = {
  Dashboard: 'Recent Transactions',
  Accounts: 'Accounts',
  Categories: 'Categories',
  Transactions: 'Transactions',
  Users: 'Users',
  'Split Weights': 'Split Weights',
  'Import CSV': 'Import CSV',
  'Backup & Restore': 'Backup & Restore',
  Charts: 'Charts',
  Help: 'Help',
}

/**
 * Open the settings menu and switch views, then wait for the new view to render.
 *
 * The menu sits in a `z-[1001]` wrapper above its own full-screen `z-[1000]`
 * backdrop; waiting on the heading guarantees the backdrop has unmounted before
 * the caller's next click, which would otherwise be intercepted.
 */
export async function gotoView(page: Page, label: ViewLabel): Promise<void> {
  const navTrigger = page.getByRole('button', { name: 'Settings', exact: true })
  await navTrigger.click()
  const menu = page.locator('div.relative').filter({ has: navTrigger })
  await menu.getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByRole('heading', { name: VIEW_HEADINGS[label], level: 2 })).toBeVisible()
}

/** The header user filter — a bare <select> with no accessible name. */
export function userFilter(page: Page): Locator {
  return page.getByRole('combobox').first()
}

/**
 * A <select> identified by an option only it carries. Almost no <select> in the
 * app has a label, but a <select>'s text content is its options concatenated.
 */
export function selectByOption(scope: Page | Locator, optionText: string): Locator {
  return scope.getByRole('combobox').filter({ hasText: optionText })
}

/**
 * Assert a toast is showing. Toasts auto-dismiss after 4s (ToastContext's
 * AUTO_DISMISS_MS), so this must be the next statement after the action that
 * raises it, and the timeout stays under the dismissal window so lateness fails
 * loudly instead of flaking.
 */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByRole('alert').filter({ hasText: text }).first()).toBeVisible({ timeout: 3_000 })
}

/** A modal by its title, e.g. `dialog(page, 'New Transaction')`. */
export function dialog(page: Page, name: string | RegExp): Locator {
  return page.getByRole('dialog', { name })
}

/**
 * Confirm a ConfirmDialog. The confirm button carries
 * `aria-label="Confirm <label>"`, which is what distinguishes it from the
 * per-row Delete buttons of the table behind the modal.
 */
export async function confirmDialog(page: Page, title: string, action = 'delete'): Promise<void> {
  const modal = dialog(page, title)
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: `Confirm ${action}`, exact: true }).click()
  await expect(modal).toBeHidden()
}

/** A CategoryPicker. Several can coexist (filters, each advanced condition, the detail modal). */
export function categoryPicker(scope: Page | Locator, index = 0): Locator {
  return scope.getByTestId('category-picker').nth(index)
}

/**
 * Choose a category through the picker's search box — that works identically for
 * a top-level category and for a child hidden under a collapsed parent.
 * `name: null` picks the clear entry, whose label is the picker's `placeholder`.
 */
export async function pickCategory(picker: Locator, name: string | null, placeholder = 'Uncategorized'): Promise<void> {
  await picker.getByRole('button').first().click()
  const menu = picker.getByTestId('category-picker-menu')
  await expect(menu).toBeVisible()
  if (name === null) {
    await menu.getByRole('button', { name: placeholder, exact: true }).click()
  } else {
    await menu.getByPlaceholder('Search categories…').fill(name)
    await menu.getByRole('button', { name, exact: true }).click()
  }
  await expect(menu).toBeHidden()
}

/**
 * A SplitEditor block. AccountsList renders two in one form (Owners + the split
 * weight tier), so pass its label to pick one.
 *
 * Matching goes through the label <span> rather than `hasText`, because
 * `hasText` is a case-insensitive substring test and "Owners" is a substring of
 * the weight tier's own label ("…separate from ownership").
 */
export function splitEditor(scope: Page | Locator, label?: string | RegExp): Locator {
  const editors = scope.getByTestId('split-editor')
  if (label === undefined) return editors
  const page = 'page' in scope && typeof scope.page === 'function' ? scope.page() : (scope as Page)
  return editors.filter({ has: page.getByText(label, { exact: typeof label === 'string' }) })
}

export function splitRows(editor: Locator): Locator {
  return editor.getByTestId('split-row')
}

export function splitRowUser(editor: Locator, index: number): Locator {
  return splitRows(editor).nth(index).getByRole('combobox')
}

export function splitRowValue(editor: Locator, index: number): Locator {
  return splitRows(editor).nth(index).getByRole('spinbutton')
}

/** Append a row to a SplitEditor and fill it in one go. */
export async function addSplitRow(
  editor: Locator, userName: string, value: number | string,
): Promise<void> {
  const before = await splitRows(editor).count()
  await editor.getByRole('button', { name: 'Add user', exact: true }).click()
  await expect(splitRows(editor)).toHaveCount(before + 1)
  await splitRowUser(editor, before).selectOption({ label: userName })
  await splitRowValue(editor, before).fill(String(value))
}

/**
 * A table data row containing `text`.
 *
 * TransactionsPage puts `role="button"` on its <tr>, which overrides the
 * implicit row role, so this deliberately goes through the DOM rather than
 * `getByRole('row')`.
 */
export function tableRow(scope: Page | Locator, text: string | RegExp): Locator {
  return scope.locator('tbody tr').filter({ hasText: text })
}

/** A short unique suffix, so a leftover row can never satisfy an assertion. */
export function unique(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 7)}`
}
