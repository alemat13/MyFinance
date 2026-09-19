import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import TransactionsPage from '../TransactionsPage'
import { formatDateGroupHeader } from '../../utils/transactions'

const { mockSearchTransactions, mockFetchAccounts, mockFetchCategories, mockCreateTransaction, mockUpdateTransaction, mockDeleteTransaction, mockFetchUsers, mockFetchSplitWeights, mockFetchTransaction, mockFetchTransactionHistory, mockBulkUpdateTransactions, mockBulkDeleteTransactions, mockFetchDivideSiblings } = vi.hoisted(() => ({
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
  mockBulkUpdateTransactions: vi.fn(),
  mockBulkDeleteTransactions: vi.fn(),
  mockFetchDivideSiblings: vi.fn().mockResolvedValue([]),
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
  bulkUpdateTransactions: mockBulkUpdateTransactions,
  bulkDeleteTransactions: mockBulkDeleteTransactions,
  fetchDivideSiblings: mockFetchDivideSiblings,
}))

const { mockDownloadBlob } = vi.hoisted(() => ({
  mockDownloadBlob: vi.fn(),
}))

vi.mock('../../utils/download', () => ({
  downloadBlob: mockDownloadBlob,
}))

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, currency: 'USD', created_at: '2026-01-01', users: [], split_weights: [] }
const baseCategory = { id: 1, name: 'Salary', type: 'Income', splits: [] }

const searchResult = (items: any[]) => ({ items, total: items.length, page: 1, page_size: 50, total_pages: 1 })

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchUsers.mockResolvedValue([])
  mockFetchSplitWeights.mockResolvedValue([])
  mockFetchTransactionHistory.mockResolvedValue([])
  mockFetchDivideSiblings.mockResolvedValue([])
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
  const txn = { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false, currency: 'USD', splits: [] }
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
  const txn = {
    id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking',
    category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false, currency: 'USD',
    splits: [{ user_id: 1, user_name: 'Alex', weight: 1, share_amount: 50, source: 'custom' }],
  }
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
  const txn = { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false, currency: 'USD', splits: [] }
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

test('changing the Reconciled filter sends it in the search request and updates the URL', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(mockSearchTransactions).toHaveBeenCalled())

  fireEvent.change(screen.getByText('Reconciled: any').closest('select')!, { target: { value: 'false' } })

  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalledWith(expect.objectContaining({ reconciled: false }))
    expect(window.location.search).toContain('reconciled=false')
  })
})

const twoTxns = [
  { id: 1, date: '2026-01-15', payee: 'Coffee', memo: null, amount: -5, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false, currency: 'USD', splits: [] },
  { id: 2, date: '2026-01-14', payee: 'Lunch', memo: null, amount: -12, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false, currency: 'USD', splits: [] },
]

test('selecting rows shows the bulk-actions bar with correct count, and Clear selection empties it', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  expect(screen.queryByText('Bulk Edit')).not.toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('Select transaction Coffee'))

  expect(screen.getByText('1 selected')).toBeInTheDocument()
  expect(screen.getByText('Bulk Edit')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('Select transaction Lunch'))
  expect(screen.getByText('2 selected')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Clear selection'))
  expect(screen.queryByText('Bulk Edit')).not.toBeInTheDocument()
})

test('select-all-on-page checkbox selects and deselects every row currently shown', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select all on this page'))
  expect(screen.getByText('2 selected')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('Select all on this page'))
  expect(screen.queryByText('Bulk Edit')).not.toBeInTheDocument()
})

test('clicking a row checkbox does not open the transaction detail modal', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select transaction Coffee'))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(mockFetchTransaction).not.toHaveBeenCalled()
})

test('clicking the reconciled icon toggles it without opening the transaction detail modal', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockUpdateTransaction.mockResolvedValue({ ...twoTxns[0], reconciled: true })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Mark Coffee as reconciled'))

  await waitFor(() => {
    expect(mockUpdateTransaction).toHaveBeenCalledWith(1, { reconciled: true }, null)
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(mockFetchTransaction).not.toHaveBeenCalled()
})

test('toggling the reconciled icon updates the row in place without a full list reload', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockUpdateTransaction.mockResolvedValue({ ...twoTxns[0], reconciled: true })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())
  mockSearchTransactions.mockClear()

  fireEvent.click(screen.getByLabelText('Mark Coffee as reconciled'))

  await waitFor(() => {
    expect(screen.getByLabelText('Mark Coffee as unreconciled')).toBeInTheDocument()
  })
  expect(mockSearchTransactions).not.toHaveBeenCalled()
})

test('toggling the reconciled icon preserves the current row selection', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockUpdateTransaction.mockResolvedValue({ ...twoTxns[0], reconciled: true })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select transaction Lunch'))
  expect(screen.getByText('1 selected')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('Mark Coffee as reconciled'))

  await waitFor(() => {
    expect(screen.getByLabelText('Mark Coffee as unreconciled')).toBeInTheDocument()
  })
  expect(screen.getByText('1 selected')).toBeInTheDocument()
  expect(screen.getByLabelText('Select transaction Lunch')).toBeChecked()
})

test('reverts the reconciled icon and reloads if the toggle PATCH fails', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockUpdateTransaction.mockRejectedValue(new Error('Update failed'))

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())
  mockSearchTransactions.mockClear()
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))

  fireEvent.click(screen.getByLabelText('Mark Coffee as reconciled'))

  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalled()
  })
  await waitFor(() => {
    expect(screen.getByLabelText('Mark Coffee as reconciled')).toBeInTheDocument()
  })
})

test('toggling a row to match the opposite of the active Reconciled filter removes it from view', async () => {
  window.history.replaceState(null, '', '/?reconciled=false')
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockUpdateTransaction.mockResolvedValue({ ...twoTxns[0], reconciled: true })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())
  expect(screen.getByText('2 results')).toBeInTheDocument()
  mockSearchTransactions.mockClear()

  fireEvent.click(screen.getByLabelText('Mark Coffee as reconciled'))

  await waitFor(() => {
    expect(screen.queryByText('Coffee')).not.toBeInTheDocument()
  })
  expect(screen.getByText('1 result')).toBeInTheDocument()
  expect(mockSearchTransactions).not.toHaveBeenCalled()
})

test('clicking Bulk Edit with N selected opens BulkEditModal with the right transaction ids', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select transaction Coffee'))
  fireEvent.click(screen.getByLabelText('Select transaction Lunch'))
  fireEvent.click(screen.getByText('Bulk Edit'))

  expect(screen.getByRole('dialog', { name: 'Bulk Edit Transactions' })).toBeInTheDocument()
  expect(screen.getByText('2 transactions selected')).toBeInTheDocument()
})

test('clicking Delete selected opens a confirm dialog, and Cancel does not call the API', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select transaction Coffee'))
  fireEvent.click(screen.getByLabelText('Select transaction Lunch'))
  fireEvent.click(screen.getByText('Delete selected'))

  expect(screen.getByRole('dialog', { name: 'Delete transactions' })).toBeInTheDocument()
  expect(screen.getByText(/Delete 2 selected transactions\?/)).toBeInTheDocument()

  fireEvent.click(screen.getByText('Cancel'))

  expect(mockBulkDeleteTransactions).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('2 selected')).toBeInTheDocument()
})

test('confirming bulk delete calls bulkDeleteTransactions with selected ids, reloads, and clears selection', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockBulkDeleteTransactions.mockResolvedValue({ deleted_count: 2, transaction_ids: [1, 2] })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select transaction Coffee'))
  fireEvent.click(screen.getByLabelText('Select transaction Lunch'))
  fireEvent.click(screen.getByText('Delete selected'))
  mockSearchTransactions.mockResolvedValue(searchResult([]))

  fireEvent.click(screen.getByLabelText('Confirm delete'))

  await waitFor(() => {
    expect(mockBulkDeleteTransactions).toHaveBeenCalledWith([1, 2], null)
  })
  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalledTimes(2)
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText('Bulk Edit')).not.toBeInTheDocument()
})

test('shows an error toast and leaves the selection unchanged if bulk delete fails', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockBulkDeleteTransactions.mockRejectedValue(new Error('Delete failed'))

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select transaction Coffee'))
  fireEvent.click(screen.getByText('Delete selected'))
  fireEvent.click(screen.getByLabelText('Confirm delete'))

  await waitFor(() => {
    expect(screen.getByText('Delete failed')).toBeInTheDocument()
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('1 selected')).toBeInTheDocument()
})

test('changing page clears the existing selection', async () => {
  mockSearchTransactions.mockResolvedValue({ items: twoTxns, total: 60, page: 1, page_size: 50, total_pages: 2 })
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Select transaction Coffee'))
  expect(screen.getByText('1 selected')).toBeInTheDocument()

  mockSearchTransactions.mockResolvedValue({ items: [], total: 60, page: 2, page_size: 50, total_pages: 2 })
  fireEvent.click(screen.getByText('Next'))

  await waitFor(() => expect(screen.getByText('Page 2 / 2')).toBeInTheDocument())
  expect(screen.queryByText('Bulk Edit')).not.toBeInTheDocument()
})

const jointAccount = {
  id: 1, name: 'Joint', type: 'Checking', balance: 100, currency: 'USD', created_at: '2026-01-01',
  users: [{ user_id: 1, user_name: 'Bob', ownership_percentage: 50 }, { user_id: 2, user_name: 'Alice', ownership_percentage: 50 }],
  split_weights: [],
}

const personalAccount = {
  id: 2, name: 'Bob Personal', type: 'Checking', balance: 100, currency: 'USD', created_at: '2026-01-01',
  users: [{ user_id: 1, user_name: 'Bob', ownership_percentage: 100 }],
  split_weights: [],
}

const groceryOnJoint = {
  id: 1, date: '2026-01-15', payee: 'Grocery', memo: null, amount: -100, account_id: 1, account_name: 'Joint',
  category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false, currency: 'USD',
  splits: [{ user_id: 1, user_name: 'Bob', weight: 55, share_amount: -55, source: 'custom' }, { user_id: 2, user_name: 'Alice', weight: 45, share_amount: -45, source: 'custom' }],
}

const groceryOnPersonal = {
  ...groceryOnJoint, id: 2, account_id: 2, account_name: 'Bob Personal',
}

test('shows My share and Balance columns for a jointly-owned account, computed from ownership and split share', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([groceryOnJoint]))
  mockFetchAccounts.mockResolvedValue([jointAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={1} />)

  await waitFor(() => expect(screen.getByText('Grocery')).toBeInTheDocument())

  expect(screen.getByText('My share')).toBeInTheDocument()
  expect(screen.getByText('Balance')).toBeInTheDocument()
  const row = screen.getByText('Grocery').closest('tr')!
  expect(within(row).getByText('-$55.00')).toBeInTheDocument()
  expect(within(row).getByText('-$5.00')).toBeInTheDocument()
})

test('Balance is positive when the user paid a shared expense from their own fully-owned account', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([groceryOnPersonal]))
  mockFetchAccounts.mockResolvedValue([personalAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={1} />)

  await waitFor(() => expect(screen.getByText('Grocery')).toBeInTheDocument())

  const row = screen.getByText('Grocery').closest('tr')!
  expect(within(row).getByText('-$55.00')).toBeInTheDocument()
  expect(within(row).getByText('$45.00')).toBeInTheDocument()
})

test('hides My share and Balance columns when no specific user is selected', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([groceryOnJoint]))
  mockFetchAccounts.mockResolvedValue([jointAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => expect(screen.getByText('Grocery')).toBeInTheDocument())

  expect(screen.queryByText('My share')).not.toBeInTheDocument()
  expect(screen.queryByText('Balance')).not.toBeInTheDocument()
})

test('Total row sums Amount, My share, and Balance across the displayed rows', async () => {
  const txnA = { ...groceryOnJoint, id: 1, payee: 'Grocery', amount: -100, splits: [{ user_id: 1, user_name: 'Bob', weight: 60, share_amount: -60, source: 'custom' }, { user_id: 2, user_name: 'Alice', weight: 40, share_amount: -40, source: 'custom' }] }
  const txnB = { ...groceryOnJoint, id: 2, payee: 'Rent', amount: -50, splits: [{ user_id: 1, user_name: 'Bob', weight: 40, share_amount: -20, source: 'custom' }, { user_id: 2, user_name: 'Alice', weight: 60, share_amount: -30, source: 'custom' }] }
  mockSearchTransactions.mockResolvedValue(searchResult([txnA, txnB]))
  mockFetchAccounts.mockResolvedValue([jointAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={1} />)

  await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())

  const totalRow = screen.getByText('Total').closest('tr')!
  expect(within(totalRow).getByText('-$150.00')).toBeInTheDocument()
  expect(within(totalRow).getByText('-$80.00')).toBeInTheDocument()
  expect(within(totalRow).getByText('-$5.00')).toBeInTheDocument()
})

const bobAndAlice = [
  { id: 1, name: 'Bob', email: null, created_at: '2026-01-01' },
  { id: 2, name: 'Alice', email: null, created_at: '2026-01-01' },
]

test('Export CSV re-requests the current filtered view unpaginated', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([groceryOnJoint]))
  mockFetchAccounts.mockResolvedValue([jointAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue(bobAndAlice)

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={1} />)
  await waitFor(() => expect(screen.getByText('Grocery')).toBeInTheDocument())

  mockSearchTransactions.mockClear()
  fireEvent.click(screen.getByText('Export'))
  fireEvent.click(screen.getByText('CSV'))

  await waitFor(() => {
    expect(mockSearchTransactions).toHaveBeenCalledWith(expect.objectContaining({ unpaginated: true, user_id: 1 }))
  })
})

test('downloads a CSV with one Weight/Share/Balance column per household user', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([groceryOnJoint]))
  mockFetchAccounts.mockResolvedValue([jointAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue(bobAndAlice)

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={1} />)
  await waitFor(() => expect(screen.getByText('Grocery')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Export'))
  fireEvent.click(screen.getByText('CSV'))

  await waitFor(() => expect(mockDownloadBlob).toHaveBeenCalled())
  const [blob, filename] = mockDownloadBlob.mock.calls[0]
  expect(filename).toMatch(/^myfinance-transactions-.*\.csv$/)

  const text: string = await blob.text()
  expect(text).toContain(
    'ID,Date,Payee,Memo,Amount,Currency,Account,Category,Accounting Month,Reconciled,Divide Group ID,'
    + 'Weight Bob,Weight Alice,Share Bob,Share Alice,Balance Bob,Balance Alice',
  )
  expect(text).toContain('1,2026-01-15,Grocery,,-100,USD,Joint,Salary,2026-01,No,,55,45,-55,-45,-5,5')
})

test('downloads an Excel file with the same data as the CSV export', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([groceryOnJoint]))
  mockFetchAccounts.mockResolvedValue([jointAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue(bobAndAlice)

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={1} />)
  await waitFor(() => expect(screen.getByText('Grocery')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Export'))
  fireEvent.click(screen.getByText('Excel'))

  await waitFor(() => expect(mockDownloadBlob).toHaveBeenCalled())
  const [blob, filename] = mockDownloadBlob.mock.calls[0]
  expect(filename).toMatch(/^myfinance-transactions-.*\.xlsx$/)
  expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  const { readSheet } = await import('read-excel-file/universal')
  const rows = await readSheet(blob)

  expect(rows[0]).toEqual([
    'ID', 'Date', 'Payee', 'Memo', 'Amount', 'Currency', 'Account', 'Category',
    'Accounting Month', 'Reconciled', 'Divide Group ID',
    'Weight Bob', 'Weight Alice', 'Share Bob', 'Share Alice', 'Balance Bob', 'Balance Alice',
  ])
  expect(rows[1][0]).toBe(1)
  expect(typeof rows[1][0]).toBe('number')
  expect(rows[1][4]).toBe(-100)
})

test('shows an error toast when the export request fails', async () => {
  mockSearchTransactions.mockResolvedValueOnce(searchResult([groceryOnJoint]))
  mockFetchAccounts.mockResolvedValue([jointAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue(bobAndAlice)

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={1} />)
  await waitFor(() => expect(screen.getByText('Grocery')).toBeInTheDocument())

  mockSearchTransactions.mockRejectedValueOnce(new Error('export exploded'))
  fireEvent.click(screen.getByText('Export'))
  fireEvent.click(screen.getByText('CSV'))

  await waitFor(() => {
    expect(screen.getByText('export exploded')).toBeInTheDocument()
  })
  expect(mockDownloadBlob).not.toHaveBeenCalled()
})

test('renders a card list instead of a table below the mobile breakpoint', async () => {
  const originalMatchMedia = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia

  try {
    mockSearchTransactions.mockResolvedValue(searchResult([
      { id: 1, date: '2026-01-15', payee: 'Coffee', memo: null, amount: -5, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] },
    ]))
    mockFetchAccounts.mockResolvedValue([baseAccount])
    mockFetchCategories.mockResolvedValue([baseCategory])

    renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

    await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  } finally {
    window.matchMedia = originalMatchMedia
  }
})

test('the mobile card list still offers select-all-on-page', async () => {
  const originalMatchMedia = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia

  try {
    mockSearchTransactions.mockResolvedValue(searchResult(twoTxns))
    mockFetchAccounts.mockResolvedValue([baseAccount])
    mockFetchCategories.mockResolvedValue([baseCategory])

    renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

    await waitFor(() => expect(screen.getByText('Coffee')).toBeInTheDocument())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Select all on this page'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Select all on this page'))
    expect(screen.queryByText('Bulk Edit')).not.toBeInTheDocument()
  } finally {
    window.matchMedia = originalMatchMedia
  }
})
