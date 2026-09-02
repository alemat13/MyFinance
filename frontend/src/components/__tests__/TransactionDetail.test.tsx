import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import TransactionDetail from '../TransactionDetail'

const { mockFetchTransaction, mockUpdateTransaction, mockDeleteTransaction, mockFetchTransactionHistory } = vi.hoisted(() => ({
  mockFetchTransaction: vi.fn(),
  mockUpdateTransaction: vi.fn(),
  mockDeleteTransaction: vi.fn(),
  mockFetchTransactionHistory: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchTransaction: mockFetchTransaction,
  updateTransaction: mockUpdateTransaction,
  deleteTransaction: mockDeleteTransaction,
  fetchTransactionHistory: mockFetchTransactionHistory,
}))

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, currency: 'USD', created_at: '2026-01-01', users: [], split_weights: [] }
const baseCategory = { id: 1, name: 'Salary', type: 'Income', splits: [] }
const baseTxn = {
  id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50,
  account_id: 1, account_name: 'Checking', currency: 'USD',
  category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01',
  splits: [],
}

const baseProps = {
  transactionId: 1,
  accounts: [baseAccount],
  categories: [baseCategory],
  allUsers: [],
  globalWeights: [],
  selectedUserId: null,
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onDeleted: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchTransactionHistory.mockResolvedValue([])
})

test('loads and displays the transaction fields', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail {...baseProps} />)

  await waitFor(() => {
    expect(mockFetchTransaction).toHaveBeenCalledWith(1, null)
  })
  expect(await screen.findByDisplayValue('Test')).toBeInTheDocument()
  expect(screen.getByDisplayValue('50')).toBeInTheDocument()
})

test('edits a field and saves, submitting the transaction\'s existing (empty) split weights', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)
  mockUpdateTransaction.mockResolvedValue({ ...baseTxn, payee: 'Updated' })

  renderWithProviders(<TransactionDetail {...baseProps} />)

  const payeeInput = await screen.findByDisplayValue('Test')
  fireEvent.change(payeeInput, { target: { value: 'Updated' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ payee: 'Updated', split_weights: [], split_source: 'custom' }),
      null,
    )
  })
  expect(baseProps.onSaved).toHaveBeenCalled()
})

test('shows the transaction\'s own stored weights, not re-prefilled from the category\'s current weight', async () => {
  const alex = { id: 1, name: 'Alex', email: null, created_at: '' }
  mockFetchTransaction.mockResolvedValue({
    ...baseTxn,
    splits: [{ user_id: 1, user_name: 'Alex', weight: 2, share_amount: 50, source: 'custom' }],
  })

  renderWithProviders(<TransactionDetail
    {...baseProps}
    allUsers={[alex]}
    categories={[{ ...baseCategory, splits: [{ user_id: 1, user_name: 'Alex', weight: 5 }] }]}
  />)

  await screen.findByDisplayValue('Test')
  // The stored weight (2) is shown, not the category's current weight (5).
  expect(screen.getByDisplayValue('2')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('5')).not.toBeInTheDocument()
})

test('quick-fill buttons are disabled when their tier has nothing configured, and enabled when it does', async () => {
  const alex = { id: 1, name: 'Alex', email: null, created_at: '' }
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail
    {...baseProps}
    allUsers={[alex]}
    accounts={[{ ...baseAccount, split_weights: [{ user_id: 1, user_name: 'Alex', weight: 7 }] }]}
  />)

  await screen.findByDisplayValue('Test')
  expect(screen.getByRole('button', { name: 'Global' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Account' })).not.toBeDisabled()
  expect(screen.getByRole('button', { name: 'Category' })).toBeDisabled()
})

test('clicking the Account quick-fill button overwrites the weight fields', async () => {
  const alex = { id: 1, name: 'Alex', email: null, created_at: '' }
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail
    {...baseProps}
    allUsers={[alex]}
    accounts={[{ ...baseAccount, split_weights: [{ user_id: 1, user_name: 'Alex', weight: 7 }] }]}
  />)

  await screen.findByDisplayValue('Test')
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))

  expect(screen.getByDisplayValue('7')).toBeInTheDocument()
})

test('clicking Split Evenly fills weight 1 for every user', async () => {
  const alex = { id: 1, name: 'Alex', email: null, created_at: '' }
  const sam = { id: 2, name: 'Sam', email: null, created_at: '' }
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail {...baseProps} allUsers={[alex, sam]} />)

  await screen.findByDisplayValue('Test')
  fireEvent.click(screen.getByRole('button', { name: 'Split Evenly' }))
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        split_weights: [{ user_id: 1, weight: 1 }, { user_id: 2, weight: 1 }],
        split_source: 'custom',
      }),
      null,
    )
  })
})

test('clicking a per-user quick-fill button assigns weight 1 to that user only', async () => {
  const alex = { id: 1, name: 'Alex', email: null, created_at: '' }
  const sam = { id: 2, name: 'Sam', email: null, created_at: '' }
  mockFetchTransaction.mockResolvedValue({
    ...baseTxn,
    splits: [
      { user_id: 1, user_name: 'Alex', weight: 3, share_amount: 25, source: 'custom' },
      { user_id: 2, user_name: 'Sam', weight: 3, share_amount: 25, source: 'custom' },
    ],
  })

  renderWithProviders(<TransactionDetail {...baseProps} allUsers={[alex, sam]} />)

  await screen.findByDisplayValue('Test')
  fireEvent.click(screen.getByRole('button', { name: 'Sam' }))
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ split_weights: [{ user_id: 2, weight: 1 }], split_source: 'custom' }),
      null,
    )
  })
})

test('free-form weight entry is accepted and submitted as source "custom"', async () => {
  const alex = { id: 1, name: 'Alex', email: null, created_at: '' }
  mockFetchTransaction.mockResolvedValue({
    ...baseTxn,
    splits: [{ user_id: 1, user_name: 'Alex', weight: 1, share_amount: 50, source: 'custom' }],
  })
  mockUpdateTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail {...baseProps} allUsers={[alex]} />)

  await screen.findByDisplayValue('Test')
  const numberInputs = screen.getAllByRole('spinbutton')
  const weightInput = numberInputs.find(el => (el as HTMLInputElement).value === '1')!
  fireEvent.change(weightInput, { target: { value: '9' } })
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ split_weights: [{ user_id: 1, weight: 9 }], split_source: 'custom' }),
      null,
    )
  })
})

test('save is rejected when payee is cleared, without calling the API', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail {...baseProps} />)

  const payeeInput = await screen.findByDisplayValue('Test')
  fireEvent.change(payeeInput, { target: { value: '' } })
  fireEvent.click(screen.getByText('Save'))

  expect(await screen.findByText('Payee and account are required')).toBeInTheDocument()
  expect(mockUpdateTransaction).not.toHaveBeenCalled()
})

test('save is rejected when account is left at the placeholder, without calling the API', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail {...baseProps} />)

  await screen.findByDisplayValue('Test')
  const accountSelect = screen.getByDisplayValue('Checking')
  fireEvent.change(accountSelect, { target: { value: '0' } })
  fireEvent.click(screen.getByText('Save'))

  expect(await screen.findByText('Payee and account are required')).toBeInTheDocument()
  expect(mockUpdateTransaction).not.toHaveBeenCalled()
})

test('delete flow asks for confirmation then deletes', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)
  mockDeleteTransaction.mockResolvedValue(undefined)

  renderWithProviders(<TransactionDetail {...baseProps} />)

  await screen.findByDisplayValue('Test')

  fireEvent.click(screen.getByText('Delete'))

  const dialog = await screen.findByRole('dialog', { name: 'Delete transaction' })
  fireEvent.click(within(dialog).getByText('Delete'))

  await waitFor(() => {
    expect(mockDeleteTransaction).toHaveBeenCalledWith(1, null)
  })
  expect(baseProps.onDeleted).toHaveBeenCalled()
})

test('pressing Escape while the delete confirmation is open closes only the confirmation, not the whole detail view', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail {...baseProps} />)

  await screen.findByDisplayValue('Test')
  fireEvent.click(screen.getByText('Delete'))
  await screen.findByRole('dialog', { name: 'Delete transaction' })

  fireEvent.keyDown(document, { key: 'Escape' })

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Delete transaction' })).not.toBeInTheDocument()
  })
  expect(baseProps.onClose).not.toHaveBeenCalled()
})

test('shows history entries', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)
  mockFetchTransactionHistory.mockResolvedValue([
    {
      id: 1, transaction_id: 1, action: 'created', source: 'manual', changed_at: '2026-01-15T10:00:00',
      changed_by_user_id: 1, changed_by_user_name: 'Alex',
      date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, category_id: 1, changes: null,
    },
    {
      id: 2, transaction_id: 1, action: 'updated', source: null, changed_at: '2026-01-16T10:00:00',
      changed_by_user_id: 1, changed_by_user_name: 'Alex',
      date: '2026-01-15', payee: 'Test Updated', memo: null, amount: 50, account_id: 1, category_id: 1,
      changes: { payee: { old: 'Test', new: 'Test Updated' } },
    },
  ])

  renderWithProviders(<TransactionDetail {...baseProps} />)

  await waitFor(() => {
    expect(mockFetchTransactionHistory).toHaveBeenCalledWith(1)
  })
  expect(await screen.findByText('created')).toBeInTheDocument()
  expect(screen.getByText(/updated/)).toBeInTheDocument()
  expect(screen.getByText(/payee: Test → Test Updated/)).toBeInTheDocument()
})

test('shows empty state when there is no recorded history', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)
  mockFetchTransactionHistory.mockResolvedValue([])

  renderWithProviders(<TransactionDetail {...baseProps} />)

  await waitFor(() => {
    expect(screen.getByText('No history recorded for this transaction')).toBeInTheDocument()
  })
})
