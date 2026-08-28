import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchAccounts, createAccount, updateAccount, deleteAccount,
  fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchTransactions, createTransaction, updateTransaction, deleteTransaction, searchTransactions,
  fetchTransactionHistory,
  fetchDashboard,
  fetchSplitWeights, updateSplitWeights, fetchSplitPreview, fetchBalances,
  detectImport, previewImport, commitImport,
} from '../client'

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('fetchAccounts makes GET request', async () => {
  const mockData = [{ id: 1, name: 'A', type: 'Checking', balance: 100, created_at: '2026-01-01' }]
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchAccounts()

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toEqual(mockData)
})

test('createAccount makes POST request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: 1, name: 'A', type: 'Checking', balance: 0, created_at: '2026-01-01' }),
    text: () => Promise.resolve(''),
  } as Response)

  await createAccount({ name: 'A', type: 'Checking' })

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'A', type: 'Checking' }),
    }),
  )
})

test('updateAccount makes PUT request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: 1, name: 'B', type: 'Checking', balance: 0, created_at: '2026-01-01' }),
    text: () => Promise.resolve(''),
  } as Response)

  await updateAccount(1, { name: 'B' })

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts/1',
    expect.objectContaining({
      method: 'PUT',
    }),
  )
})

test('deleteAccount makes DELETE request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  await deleteAccount(1)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts/1',
    expect.objectContaining({
      method: 'DELETE',
    }),
  )
})

test('fetchCategories makes GET request', async () => {
  const mockData = [{ id: 1, name: 'Salary', type: 'Income' }]
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchCategories()

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toEqual(mockData)
})

test('createCategory makes POST request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: 1, name: 'Food', type: 'Expense' }),
    text: () => Promise.resolve(''),
  } as Response)

  await createCategory({ name: 'Food', type: 'Expense' })

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Food', type: 'Expense' }),
    }),
  )
})

test('updateCategory makes PUT request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await updateCategory(1, { name: 'Food' })

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories/1',
    expect.objectContaining({
      method: 'PUT',
    }),
  )
})

test('deleteCategory makes DELETE request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  await deleteCategory(1)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories/1',
    expect.objectContaining({
      method: 'DELETE',
    }),
  )
})

test('fetchTransactions makes GET request', async () => {
  const mockData = [{ id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'A', category_id: 1, category_name: 'C' }]
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchTransactions()

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toHaveLength(1)
})

test('searchTransactions makes POST request with the filter body', async () => {
  const mockData = { items: [], total: 0, page: 1, page_size: 50, total_pages: 1 }
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const req = { search: 'amazon', page: 1, page_size: 50 }
  const result = await searchTransactions(req)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/search',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(req),
    }),
  )
  expect(result).toEqual(mockData)
})

test('createTransaction makes POST request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await createTransaction({ date: '2026-01-15', payee: 'Test', amount: 50, account_id: 1, category_id: 1 })

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-15', payee: 'Test', amount: 50, account_id: 1, category_id: 1 }),
    }),
  )
})

test('updateTransaction makes PUT request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await updateTransaction(1, { payee: 'Updated' })

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/1',
    expect.objectContaining({
      method: 'PUT',
    }),
  )
})

test('deleteTransaction makes DELETE request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  await deleteTransaction(1)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/1',
    expect.objectContaining({
      method: 'DELETE',
    }),
  )
})

test('createTransaction appends actor_user_id only when provided', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await createTransaction({ date: '2026-01-15', payee: 'Test', amount: 50, account_id: 1, category_id: 1 }, 7)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions?actor_user_id=7',
    expect.objectContaining({ method: 'POST' }),
  )
})

test('updateTransaction appends actor_user_id only when provided', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await updateTransaction(1, { payee: 'Updated' }, 7)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/1?actor_user_id=7',
    expect.objectContaining({ method: 'PUT' }),
  )
})

test('deleteTransaction appends actor_user_id only when provided', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  await deleteTransaction(1, 7)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/1?actor_user_id=7',
    expect.objectContaining({ method: 'DELETE' }),
  )
})

test('fetchTransactionHistory makes GET request', async () => {
  const mockData = [{ id: 1, transaction_id: 1, action: 'created', source: 'manual', changed_at: '2026-01-15T10:00:00', changed_by_user_id: null, changed_by_user_name: null, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, category_id: 1, changes: null }]
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchTransactionHistory(1)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/1/history',
    expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
  )
  expect(result).toEqual(mockData)
})

test('fetchDashboard makes GET request', async () => {
  const mockData = { accounts: [], recent_transactions: [], balances: [] }
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchDashboard()

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/dashboard',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toEqual(mockData)
})

test('fetchSplitWeights makes GET request', async () => {
  const mockData = [{ user_id: 1, user_name: 'Alex', weight: 100 }]
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchSplitWeights()

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/split-weights',
    expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
  )
  expect(result).toEqual(mockData)
})

test('updateSplitWeights makes PUT request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve(''),
  } as Response)

  await updateSplitWeights([{ user_id: 1, weight: 100 }])

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/split-weights',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify([{ user_id: 1, weight: 100 }]),
    }),
  )
})

test('fetchSplitPreview makes POST request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve(''),
  } as Response)

  await fetchSplitPreview(100, 5)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/split-preview',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ amount: 100, category_id: 5, account_id: null }),
    }),
  )
})

test('fetchBalances makes GET request', async () => {
  const mockData = [{ user_id: 1, user_name: 'Alex', net_position: -50 }]
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchBalances()

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/balances',
    expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
  )
  expect(result).toEqual(mockData)
})

test('detectImport makes POST request with the file as form data', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ headers: [], encoding: 'utf-8', delimiter: ',', date_format: null, decimal_separator: '.', column_mapping: {}, sample_rows: [] }),
    text: () => Promise.resolve(''),
  } as Response)

  const file = new File(['a,b\n1,2'], 'transactions.csv', { type: 'text/csv' })
  await detectImport(file)

  expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:8000/api/import/detect', expect.objectContaining({ method: 'POST' }))
  const body = vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as FormData
  expect(body.get('file')).toBe(file)
})

test('previewImport makes POST request with the file and params as form data', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve(''),
  } as Response)

  const file = new File(['a,b\n1,2'], 'transactions.csv', { type: 'text/csv' })
  const req = {
    account_id: 1, encoding: 'utf-8', delimiter: ',', date_format: '%Y-%m-%d',
    decimal_separator: '.', date_col: 'a', payee_col: 'b', amount_col: 'a',
    memo_col: null, category_col: null,
  }
  await previewImport(file, req)

  expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:8000/api/import/preview', expect.objectContaining({ method: 'POST' }))
  const body = vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as FormData
  expect(body.get('file')).toBe(file)
  expect(body.get('account_id')).toBe('1')
  expect(body.get('date_col')).toBe('a')
  expect(body.get('memo_col')).toBeNull()
})

test('commitImport makes POST request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ created_count: 1, transaction_ids: [1] }),
    text: () => Promise.resolve(''),
  } as Response)

  const rows = [{ date: '2026-01-15', payee: 'Test', amount: 50, account_id: 1, category_id: 1 }]
  const result = await commitImport(rows)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/import/commit',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),
  )
  expect(result).toEqual({ created_count: 1, transaction_ids: [1] })
})

test('commitImport appends actor_user_id only when provided', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ created_count: 0, transaction_ids: [] }),
    text: () => Promise.resolve(''),
  } as Response)

  const rows = [{ date: '2026-01-15', payee: 'Test', amount: 50, account_id: 1, category_id: 1 }]
  await commitImport(rows, 7)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/import/commit?actor_user_id=7',
    expect.objectContaining({ method: 'POST' }),
  )
})

test('request handles 204 No Content', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  const result = await deleteAccount(1)

  expect(result).toBeUndefined()
})

test('request throws on non-ok response', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: false,
    status: 404,
    text: () => Promise.resolve('Not Found'),
  } as Response)

  await expect(fetchAccounts()).rejects.toThrow('Not Found')
})

test('request throws on non-ok without body', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: false,
    status: 500,
    text: () => Promise.resolve(''),
  } as Response)

  await expect(fetchAccounts()).rejects.toThrow('500')
})

test('request parses JSON detail string from backend', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: false,
    status: 409,
    text: () => Promise.resolve(JSON.stringify({ detail: 'Cannot delete user who owns accounts' })),
  } as Response)

  await expect(fetchAccounts()).rejects.toThrow('Cannot delete user who owns accounts')
})

test('request parses JSON detail array (pydantic shape) into readable message', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: false,
    status: 422,
    text: () => Promise.resolve(JSON.stringify({
      detail: [{ loc: ['body', 'currency'], msg: "Value error, Currency must be a 3-letter code, got 'US'", type: 'value_error' }],
    })),
  } as Response)

  await expect(fetchAccounts()).rejects.toThrow("currency: Value error, Currency must be a 3-letter code, got 'US'")
})
