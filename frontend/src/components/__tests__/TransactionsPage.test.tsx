import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import TransactionsPage from '../TransactionsPage'
import { formatDateGroupHeader } from '../../utils/transactions'

// The new-transaction form's CategoryPicker is a popover, not a native
// <select> — open it and click the target category by name, scoped to the
// form so it doesn't collide with the filter bar's own CategoryPicker.
function selectCategoryInNewTransactionForm(categoryName: string) {
  const formContainer = screen.getByPlaceholderText('Payee').closest('.flex.gap-2.flex-wrap.items-end') as HTMLElement
  fireEvent.click(within(formContainer).getByText('Uncategorized'))
  fireEvent.click(within(formContainer).getByText(categoryName))
}

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

test('can open new transaction form', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([])
  mockFetchCategories.mockResolvedValue([])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  expect(screen.getByPlaceholderText('Payee')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Amount')).toBeInTheDocument()
})

test('create new transaction', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockCreateTransaction.mockResolvedValue({ id: 1, date: '2026-01-15', payee: 'New Payee', memo: '', amount: 100, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })

  // The filter bar contributes the first combobox (Account — its Category
  // filter is a CategoryPicker popover, not a <select>); the new-transaction
  // form's Accounting Month/Account selects come next, and its Category
  // field is a CategoryPicker too.
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[2], { target: { value: '1' } })
  selectCategoryInNewTransactionForm('Salary')

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateTransaction).toHaveBeenCalled()
  })
})

test('can save a new transaction without picking a category', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockCreateTransaction.mockResolvedValue({ id: 1, date: '2026-01-15', payee: 'New Payee', memo: '', amount: 100, account_id: 1, account_name: 'Checking', category_id: null, category_name: null, splits: [] })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })

  // Only the account is picked; category is left as "Uncategorized" (the default).
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[2], { target: { value: '1' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: null }),
      null,
    )
  })
})

test('can select a non-default accounting month offset when creating a transaction', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockCreateTransaction.mockResolvedValue({ id: 1, date: '2026-01-15', payee: 'New Payee', memo: '', amount: 100, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', accounting_month_offset: 1, accounting_month: '2026-02', splits: [] })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })

  const selects = screen.getAllByRole('combobox')
  // The filter bar contributes the first combobox (Account); the
  // new-transaction form's month/Account selects come next (its Category
  // field is a CategoryPicker popover, not part of this list).
  fireEvent.change(selects[1], { target: { value: '1' } })
  fireEvent.change(selects[2], { target: { value: '1' } })
  selectCategoryInNewTransactionForm('Salary')

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ accounting_month_offset: 1 }),
      null,
    )
  })
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

test('auto-prefills split weights from the category default when a category is selected', async () => {
  const categoryWithSplit = { ...baseCategory, splits: [{ user_id: 1, user_name: 'Alex', weight: 3 }, { user_id: 2, user_name: 'Olivia', weight: 1 }] }
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([categoryWithSplit])
  mockFetchUsers.mockResolvedValue([{ id: 1, name: 'Alex', email: null, created_at: '' }, { id: 2, name: 'Olivia', email: null, created_at: '' }])
  mockCreateTransaction.mockResolvedValue({ id: 1, date: '2026-01-15', payee: 'New Payee', memo: '', amount: 100, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })
  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[2], { target: { value: '1' } })
  selectCategoryInNewTransactionForm('Salary')

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      split_weights: [
        { user_id: 1, weight: 3 },
        { user_id: 2, weight: 1 },
      ],
      split_source: 'category',
    }), null)
  })
})

test('quick-fill button is disabled when the account has no configured split weight', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue([{ id: 1, name: 'Alex', email: null, created_at: '' }])

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))

  expect(screen.getByRole('button', { name: 'Account' })).toBeDisabled()
})

test('free-form weight entry on a new transaction is submitted with source "custom"', async () => {
  mockSearchTransactions.mockResolvedValue(searchResult([]))
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockFetchCategories.mockResolvedValue([baseCategory])
  mockFetchUsers.mockResolvedValue([{ id: 1, name: 'Alex', email: null, created_at: '' }])
  mockCreateTransaction.mockResolvedValue({ id: 1, date: '2026-01-15', payee: 'New Payee', memo: '', amount: 100, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary', splits: [] })

  renderWithProviders(<TransactionsPage onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No transactions match your filters')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Transaction'))
  fireEvent.change(screen.getByPlaceholderText('Payee'), { target: { value: 'New Payee' } })
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '100' } })
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[2], { target: { value: '1' } })
  selectCategoryInNewTransactionForm('Salary')

  fireEvent.click(screen.getByLabelText('Add user'))
  const numberInputs = screen.getAllByRole('spinbutton')
  const weightInput = numberInputs.find(el => (el as HTMLInputElement).value === '0')!
  fireEvent.change(weightInput, { target: { value: '5' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      split_weights: [{ user_id: 1, weight: 5 }],
      split_source: 'custom',
    }), null)
  })
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
