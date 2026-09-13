import { test, expect } from './fixtures'
import {
  categoryPicker, dialog, expectToast, gotoView, pickCategory, selectByOption,
  splitEditor, splitRowUser, splitRowValue, splitRows, tableRow,
} from './helpers'

test.beforeEach(async ({ app: page }) => {
  await gotoView(page, 'Transactions')
})

test.describe('transaction splits', () => {
  test('shows the weights a seeded transaction was stored with', async ({ app: page }) => {
    // Whole Foods sits on Joint Checking under Groceries, which has no category
    // tier — so seed.py resolved it from the account tier (55/45).
    await tableRow(page, 'Whole Foods').click()
    const modal = dialog(page, 'Whole Foods')
    const editor = splitEditor(modal, 'Split')

    await expect(splitRows(editor)).toHaveCount(2)
    await expect(splitRowUser(editor, 0)).toHaveValue('1')
    await expect(splitRowValue(editor, 0)).toHaveValue('55')
    await expect(splitRowUser(editor, 1)).toHaveValue('2')
    await expect(splitRowValue(editor, 1)).toHaveValue('45')
    await expect(editor.getByText('Total weight: 100')).toBeVisible()
  })

  test('each quick-fill button applies its own tier', async ({ app: page }) => {
    await tableRow(page, 'Whole Foods').click()
    const modal = dialog(page, 'Whole Foods')
    const editor = splitEditor(modal, 'Split')

    await modal.getByRole('button', { name: 'Global', exact: true }).click()
    await expect(splitRowValue(editor, 0)).toHaveValue('52000')
    await expect(splitRowValue(editor, 1)).toHaveValue('48000')

    await modal.getByRole('button', { name: 'Account', exact: true }).click()
    await expect(splitRowValue(editor, 0)).toHaveValue('55')

    // Groceries has no category tier, so that button stays disabled until a
    // category that does have one is picked (Transfer, 50/50 in seed.py).
    await expect(modal.getByRole('button', { name: 'Category', exact: true })).toBeDisabled()
    await pickCategory(categoryPicker(modal), 'Transfer')
    await modal.getByRole('button', { name: 'Category', exact: true }).click()
    await expect(splitRowValue(editor, 0)).toHaveValue('50')
    await expect(splitRowValue(editor, 1)).toHaveValue('50')
  })

  test('a per-user button assigns the whole transaction to that user', async ({ app: page }) => {
    await tableRow(page, 'Whole Foods').click()
    const modal = dialog(page, 'Whole Foods')
    const editor = splitEditor(modal, 'Split')

    await modal.getByRole('button', { name: 'Alice', exact: true }).click()
    await expect(splitRows(editor)).toHaveCount(1)
    await expect(splitRowUser(editor, 0)).toHaveValue('1')
    await expect(splitRowValue(editor, 0)).toHaveValue('1')
    await expect(splitRows(editor).first()).toContainText('-€120.50')

    await modal.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(modal).toBeHidden()
    await expect(tableRow(page, 'Whole Foods')).toContainText('Alice -€120.50')
  })

  test('"Split Evenly" prorates the same way the backend does', async ({ app: page }) => {
    await tableRow(page, 'Whole Foods').click()
    const modal = dialog(page, 'Whole Foods')
    const editor = splitEditor(modal, 'Split')

    // An odd cent is the interesting case: each share is rounded to 2dp and the
    // remainder goes to the highest user_id, so Bob absorbs the extra cent.
    await modal.getByPlaceholder('Amount').fill('-33.33')
    await modal.getByRole('button', { name: 'Split Evenly', exact: true }).click()

    await expect(splitRows(editor).nth(0)).toContainText('-€16.66')
    await expect(splitRows(editor).nth(1)).toContainText('-€16.67')

    await modal.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(modal).toBeHidden()

    // The same figures after a round trip prove prorateWeights() (client) and
    // prorate() (server) agree, remainder included.
    await expect(tableRow(page, 'Whole Foods')).toContainText('Alice -€16.66 / Bob -€16.67')
    await page.reload()
    await expect(tableRow(page, 'Whole Foods')).toContainText('Alice -€16.66 / Bob -€16.67')
  })

  test('rows can be added, retargeted and removed by hand', async ({ app: page }) => {
    await tableRow(page, 'Whole Foods').click()
    const modal = dialog(page, 'Whole Foods')
    const editor = splitEditor(modal, 'Split')

    await splitRowValue(editor, 0).fill('3')
    await expect(editor.getByText('Total weight: 48')).toBeVisible()

    await splitRows(editor).nth(1).getByRole('button', { name: 'Remove row', exact: true }).click()
    await expect(splitRows(editor)).toHaveCount(1)
    await expect(editor.getByText('Total weight: 3')).toBeVisible()

    await editor.getByRole('button', { name: 'Add user', exact: true }).click()
    await expect(splitRows(editor)).toHaveCount(2)
    await expect(splitRowUser(editor, 1)).toHaveValue('2')
  })

  test('an empty split is rejected — splits are mandatory', async ({ app: page }) => {
    await tableRow(page, 'Whole Foods').click()
    const modal = dialog(page, 'Whole Foods')
    const editor = splitEditor(modal, 'Split')

    await splitRows(editor).nth(1).getByRole('button', { name: 'Remove row', exact: true }).click()
    await splitRows(editor).nth(0).getByRole('button', { name: 'Remove row', exact: true }).click()
    await expect(editor.getByText('None assigned')).toBeVisible()

    await modal.getByRole('button', { name: 'Save', exact: true }).click()
    await expectToast(page, 'Add at least one person to the split')
    await expect(modal).toBeVisible()
  })

  test('a new transaction prefills its split from the category > account > global cascade', async ({ app: page }) => {
    await page.getByRole('button', { name: '+ New Transaction', exact: true }).click()
    const modal = dialog(page, 'New Transaction')
    const editor = splitEditor(modal, 'Split')

    // Global is the floor before an account is chosen.
    await expect(splitRowValue(editor, 0)).toHaveValue('52000')

    // The account tier outranks it.
    await selectByOption(modal, 'Account').selectOption({ label: 'Joint Checking' })
    await expect(splitRowValue(editor, 0)).toHaveValue('55')
    await expect(splitRowValue(editor, 1)).toHaveValue('45')

    // And the category tier outranks the account tier.
    await pickCategory(categoryPicker(modal), 'Transfer')
    await expect(splitRowValue(editor, 0)).toHaveValue('50')
    await expect(splitRowValue(editor, 1)).toHaveValue('50')
  })

  test('editing a split moves the reported balance', async ({ app: page }) => {
    // The Card wrapping the "Balance" label; its text is the whole net-position
    // readout, whatever shape it takes for the current user filter.
    const balanceCard = page.getByText('Balance', { exact: true }).locator('xpath=ancestor::div[1]')

    await gotoView(page, 'Dashboard')
    await expect(balanceCard).toBeVisible()
    const before = (await balanceCard.textContent()) ?? ''

    // Hand a €1,800 rent payment entirely to Alice; the balance must follow.
    await gotoView(page, 'Transactions')
    await tableRow(page, 'Sunset Properties').first().click()
    const modal = dialog(page, 'Sunset Properties')
    await modal.getByRole('button', { name: 'Alice', exact: true }).click()
    await modal.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(modal).toBeHidden()

    await gotoView(page, 'Dashboard')
    await expect(balanceCard).not.toHaveText(before)
  })
})
