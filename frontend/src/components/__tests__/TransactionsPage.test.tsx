import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import TransactionsPage from '../TransactionsPage'
import { formatDateGroupHeader } from '../../utils/transactions'

const { mockSearchTransactions, mockFetchAccounts, mockFetchCategories, mockCreateTransaction, mockUpdateTransaction, mockDeleteTransaction, mockFetchUsers, mockFetchSplitWeights, mockFetchTransaction, mockFetchTransactionHistory } = vi.hoisted(() => ({
  mockSearchTransactions: vi.fn(),
  mockFetchAccounts: vi.fn(),
  mockFetchCategories: vi.fn(),
  mockCreateTransaction: vi.fn(),
  mockUpdateTransaction: vi.fn(),
  mockDeleteTransaction: vi.fn(),
  mockFetchUsers: vi.fn().mockResolvedValue([]),
  mockFetchSplitWeights: vi.fn().mockResolvedValue([]),
  mockFetchTransaction: vi.fn(),
  mockFetchTransactionHistory: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/client', () => ({
  searchTransactions: mockSearchTransactions,
  fetchAccounts: mockFetchAccounts,
  fetchCategories: mockFetchCategories,
  createTransaction: mockCreateTransaction,
  updateTransaction: mockUpdateTransaction,
  deleteTransaction: mockDeleteTransaction,
  fetchUsers: mockFetchUsers,
  fetchSplitWeights: mockFetchSplitWeights,
  fetchTransaction: mockFetchTransaction,
  fetchTransactionHistory: mockFetchTransactionHistory,
}))

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, currency: 'USD', created_at: '2026-01-01', users: [], split_weights: [] }
const baseCategory = { id: 1, name: 'Salary', type: 'Income', splits: [] }

const searchResult = (items: any[]) => ({ items, total: items.length, page: 1, page_size: 50, total_pages: 1 })

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchUsers.mockResolvedValue([])
  mockFetchSplitWeights.mockResolvedValue([])
  mockFetchTransactionHistory.mockResolvedValue([])
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

test('shows loading state', () => {
  mockSearchTransactions.mockReturnValue(new Promise(() => {}))
  mockFetchAccounts.mockReturnValue(new Promise(() => {}))
  mockFetchCategories.mockReturnValue(new Promise(() => {}))

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders transactions with account/category dropdowns', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([{ id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] }]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
})

test('groups same-day transactions under one date header, sorted by date by default', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([
    { id: 1, date: '2026-01-15', payee: 'Coffee', memo: null, amount: -5, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] },
    { id: 2, date: '2026-01-15', payee: 'Lunch', memo: null, amount: -12, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] },
    { id: 3, date: '2026-01-14', payee: 'Groceries', memo: null, amount: -30, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] },
  ]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Coffee')).toBeInTheDocument()
  })

  expect(screen.getAllByText(formatDateGroupHeader('2026-01-15'))).toHaveLength(1)
  expect(screen.getAllByText(formatDateGroupHeader('2026-01-14'))).toHaveLength(1)
})

test('shows error state on fetch failure', async () => {
  mockSearchTransactions.mockRejectedValue(new Error('Failed to load'))
  mockFetchAccounts.mockResolvedValue([])
  mockFetchCategories.mockResolvedValue([])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})

test('clicking + New Transaction opens the detail panel in create mode', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([])
  mockFetchCategories.mockResolvedValue([])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  expect(screen.getByRole('dialog', { name: 'New Transaction' })).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Payee')).toBeInTheDocument()
  expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  expect(mockFetchTransaction).not.toHaveBeenCalled()
})

test('clicking a transaction row opens the detail view and updates the URL', async () => {
  const txn = { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', currency: 'USD', splits: [] }
  mockSearchTransactions.mockResolvedValue(searchResult([txn]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchTransaction.mockResolvedValue(txn)

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Test'))

  await waitFor(() => {
    expect(mockFetchTransaction).toHaveBeenCalledWith(1, null)
  })
  expect(window.location.search).toContain('transaction=1')
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('saving from the detail view refreshes the transaction list without refetching accounts/categories/users', async () => {
  const txn = { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', currency: 'USD', splits: [] }
  mockSearchTransactions.mockResolvedValue(searchResult([txn]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchTransaction.mockResolvedValue(txn)
  mockUpdateTransaction.mockResolvedValue({ ...txn, payee: 'Updated' })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
  fireEvent.click(screen.getByText('Test'))
  await screen.findByRole('dialog')

  mockFetchAccounts.mockClear()
  mockFetchCategories.mockClear()
  mockFetchUsers.mockClear()
  mockSearchTransactions.mockClear()

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalled()
  })
  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalled()
  })
  expect(mockFetchAccounts).not.toHaveBeenCalled()
  expect(mockFetchCategories).not.toHaveBeenCalled()
  expect(mockFetchUsers).not.toHaveBeenCalled()
})

test('pressing Enter on a focused transaction row opens the detail view', async () => {
  const txn = { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', currency: 'USD', splits: [] }
  mockSearchTransactions.mockResolvedValue(searchResult([txn]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchTransaction.mockResolvedValue(txn)

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  const row = screen.getByText('Test').closest('tr')!
  expect(row).toHaveAttribute('tabIndex', '0')
  fireEvent.keyDown(row, { key: 'Enter' })

  await waitFor(() => {
    expect(mockFetchTransaction).toHaveBeenCalledWith(1, null)
  })
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

test('simple mode text search triggers a debounced search request', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(mockSearchTransactions).toHaveBeenCalled())
  mockSearchTransactions.mockClear()

  fireEvent.change(screen.getByPlaceholderText('Search payee/memo'), { target: { value: 'amazon' } })

  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalledWith(expect.objectContaining({ search: 'amazon' }))
  }, { timeout: 1000 })
})

test('advanced mode builds a conditions request', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(mockSearchTransactions).toHaveBeenCalled())

  fireEvent.click(screen.getByText('Advanced'))
  fireEvent.click(screen.getByText('+ Add condition'))

  const valueInput = screen.getByRole('textbox') // payee value input, default field
  fireEvent.change(valueInput, { target: { value: 'amazon' } })

  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalledWith(expect.objectContaining({
      match_mode: 'all',
      conditions: [{ field: 'payee', operator: 'contains', value: 'amazon', value2: undefined }],
    }))
  }, { timeout: 1000 })
})

test('pagination controls change page', async () => {
  mockSearchTransactions.mockResolvedValue({ items: [], total: 60, page: 1, page_size: 50, total_pages: 2 })
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Page 1 / 2')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Next'))

  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
  })
})

test('hydrates simple-mode filters from the URL on mount', async () => {
  window.history.replaceState(null, '', '/?q=amazon&page=2')
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalledWith(expect.objectContaining({ search: 'amazon', page: 2 }))
  })
  expect(screen.getByPlaceholderText('Search payee/memo')).toHaveValue('amazon')
})

test('changing a simple-mode filter updates the URL', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(mockSearchTransactions).toHaveBeenCalled())

  fireEvent.change(screen.getByPlaceholderText('Search payee/memo'), { target: { value: 'amazon' } })

  await waitFor(() => {
    expect(window.location.search).toContain('q=amazon')
  }, { timeout: 1000 })
})

test('advanced mode conditions round-trip through the conditions URL param', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(mockSearchTransactions).toHaveBeenCalled())

  fireEvent.click(screen.getByText('Advanced'))
  fireEvent.click(screen.getByText('+ Add condition'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'amazon' } })

  await waitFor(() => {
    expect(window.location.search).toContain('mode=advanced')
    expect(window.location.search).toContain('conditions=')
  }, { timeout: 1000 })

  const conditionsParam = new URLSearchParams(window.location.search).get('conditions')!
  expect(JSON.parse(decodeURIComponent(conditionsParam))).toEqual([
    { field: 'payee', operator: 'contains', value: 'amazon', value2: '' },
  ])
})
