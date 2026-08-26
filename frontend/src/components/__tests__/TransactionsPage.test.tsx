import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TransactionsPage from '../TransactionsPage'

const { mockFetchTransactions, mockFetchAccounts, mockFetchCategories, mockCreateTransaction, mockUpdateTransaction, mockDeleteTransaction, mockFetchUsers, mockFetchSplitPreview } = vi.hoisted(() => ({
  mockFetchTransactions: vi.fn(),
  mockFetchAccounts: vi.fn(),
  mockFetchCategories: vi.fn(),
  mockCreateTransaction: vi.fn(),
  mockUpdateTransaction: vi.fn(),
  mockDeleteTransaction: vi.fn(),
  mockFetchUsers: vi.fn().mockResolvedValue([]),
  mockFetchSplitPreview: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/client', () => ({
  fetchTransactions: mockFetchTransactions,
  fetchAccounts: mockFetchAccounts,
  fetchCategories: mockFetchCategories,
  createTransaction: mockCreateTransaction,
  updateTransaction: mockUpdateTransaction,
  deleteTransaction: mockDeleteTransaction,
  fetchUsers: mockFetchUsers,
  fetchSplitPreview: mockFetchSplitPreview,
}))

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, created_at: '2026-01-01', users: [] }
const baseCategory = { id: 1, name: 'Salary', type: 'Income', splits: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchUsers.mockResolvedValue([])
  mockFetchSplitPreview.mockResolvedValue([])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows loading state', () => {
  mockFetchTransactions.mockReturnValue(new Promise(() => {}))
  mockFetchAccounts.mockReturnValue(new Promise(() => {}))
  mockFetchCategories.mockReturnValue(new Promise(() => {}))

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders transactions with account/category dropdowns', async () => {
  mockFetchTransactions.mockResolvedValue([{ id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] }])
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
})

test('shows error state on fetch failure', async () => {
  mockFetchTransactions.mockRejectedValue(new Error('Failed to load'))
  mockFetchAccounts.mockResolvedValue([])
  mockFetchCategories.mockResolvedValue([])

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})

test('can open new transaction form', async () => {
  mockFetchTransactions.mockResolvedValue([])
  mockFetchAccounts.mockResolvedValue([])
  mockFetchCategories.mockResolvedValue([])

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  expect(screen.getByPlaceholderText('Payee')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Amount')).toBeInTheDocument()
})

test('create new transaction', async () => {
  mockFetchTransactions.mockResolvedValue([])
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockCreateTransaction.mockResolvedValue({ id: 1, date: '2026-01-15', payee: 'New Payee', memo: '', amount: 100, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] })

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })

  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[0], { target: { value: '1' } })
  fireEvent.change(selects[1], { target: { value: '1' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateTransaction).toHaveBeenCalled()
  })
})

test('can edit inline', async () => {
  const txn = { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] }
  mockFetchTransactions.mockResolvedValue([txn])
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockUpdateTransaction.mockResolvedValue({ ...txn, payee: 'Updated' })

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))

  const payeeInput = screen.getByDisplayValue('Test')
  fireEvent.change(payeeInput, { target: { value: 'Updated' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalledWith(1, expect.objectContaining({ payee: 'Updated' }))
  })
})

test('shows default split preview and can submit a custom override', async () => {
  mockFetchTransactions.mockResolvedValue([])
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue([{ id: 1, name: 'Alex', email: null, created_at: '' }, { id: 2, name: 'Olivia', email: null, created_at: '' }])
  mockFetchSplitPreview.mockResolvedValue([
    { user_id: 1, user_name: 'Alex', share_amount: 60, source: 'global_default' },
    { user_id: 2, user_name: 'Olivia', share_amount: 40, source: 'global_default' },
  ])
  mockCreateTransaction.mockResolvedValue({ id: 1, date: '2026-01-15', payee: 'New Payee', memo: '', amount: 100, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] })

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[0], { target: { value: '1' } })
  fireEvent.change(selects[1], { target: { value: '1' } })

  await waitFor(() => {
    expect(screen.getByText(/Default split: Alex 60.00 \/ Olivia 40.00/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByLabelText('Customize split'))
  const amountInputs = screen.getAllByDisplayValue('60')
  fireEvent.change(amountInputs[0], { target: { value: '70' } })
  const remaining = screen.getAllByDisplayValue('40')
  fireEvent.change(remaining[0], { target: { value: '30' } })

  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      split_overrides: [
        { user_id: 1, share_amount: 70 },
        { user_id: 2, share_amount: 30 },
      ],
    }))
  })
})

test('rejects a custom split that does not sum to the amount', async () => {
  mockFetchTransactions.mockResolvedValue([])
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue([{ id: 1, name: 'Alex', email: null, created_at: '' }])
  mockFetchSplitPreview.mockResolvedValue([{ user_id: 1, user_name: 'Alex', share_amount: 100, source: 'global_default' }])

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))
  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[0], { target: { value: '1' } })
  fireEvent.change(selects[1], { target: { value: '1' } })

  await waitFor(() => {
    expect(screen.getByText(/Default split:/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByLabelText('Customize split'))
  const hundredInputs = screen.getAllByDisplayValue('100')
  fireEvent.change(hundredInputs[hundredInputs.length - 1], { target: { value: '40' } })

  fireEvent.click(screen.getByText('Save'))

  expect(mockCreateTransaction).not.toHaveBeenCalled()
})

test('can delete', async () => {
  const txn = { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] }
  mockFetchTransactions.mockResolvedValue([txn])
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockDeleteTransaction.mockResolvedValue(undefined)

  render(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  await waitFor(() => {
    expect(mockDeleteTransaction).toHaveBeenCalledWith(1)
  })
})
