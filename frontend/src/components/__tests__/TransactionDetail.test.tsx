import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import TransactionDetail from '../TransactionDetail'

const { mockFetchTransaction, mockUpdateTransaction, mockDeleteTransaction, mockFetchTransactionHistory, mockFetchSplitPreview } = vi.hoisted(() => ({
  mockFetchTransaction: vi.fn(),
  mockUpdateTransaction: vi.fn(),
  mockDeleteTransaction: vi.fn(),
  mockFetchTransactionHistory: vi.fn(),
  mockFetchSplitPreview: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/client', () => ({
  fetchTransaction: mockFetchTransaction,
  updateTransaction: mockUpdateTransaction,
  deleteTransaction: mockDeleteTransaction,
  fetchTransactionHistory: mockFetchTransactionHistory,
  fetchSplitPreview: mockFetchSplitPreview,
}))

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, currency: 'USD', created_at: '2026-01-01', users: [] }
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
  selectedUserId: null,
  onClose: vi.fn(),
  onSaved: vi.fn(),
  onDeleted: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchSplitPreview.mockResolvedValue([])
  mockFetchTransactionHistory.mockResolvedValue([])
})

test('loads and displays the transaction fields', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)

  renderWithProviders(<TransactionDetail {...baseProps} />)

  await waitFor(() => {
    expect(mockFetchTransaction).toHaveBeenCalledWith(1)
  })
  expect(await screen.findByDisplayValue('Test')).toBeInTheDocument()
  expect(screen.getByDisplayValue('50')).toBeInTheDocument()
})

test('edits a field and saves', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)
  mockUpdateTransaction.mockResolvedValue({ ...baseTxn, payee: 'Updated' })

  renderWithProviders(<TransactionDetail {...baseProps} />)

  const payeeInput = await screen.findByDisplayValue('Test')
  fireEvent.change(payeeInput, { target: { value: 'Updated' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalledWith(1, expect.objectContaining({ payee: 'Updated' }), null)
  })
  expect(baseProps.onSaved).toHaveBeenCalled()
})

test('rejects a custom split that does not sum to the amount', async () => {
  mockFetchTransaction.mockResolvedValue(baseTxn)
  mockFetchSplitPreview.mockResolvedValue([{ user_id: 1, user_name: 'Alex', share_amount: 50, source: 'global_default' }])

  renderWithProviders(<TransactionDetail {...baseProps} allUsers={[{ id: 1, name: 'Alex', email: null, created_at: '' }]} />)

  await screen.findByDisplayValue('Test')

  await waitFor(() => {
    expect(screen.getByText(/Default split:/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByLabelText('Customize split'))
  const shareInputs = screen.getAllByDisplayValue('50')
  fireEvent.change(shareInputs[shareInputs.length - 1], { target: { value: '30' } })

  fireEvent.click(screen.getByText('Save'))

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
