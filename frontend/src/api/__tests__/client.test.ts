import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchAccounts, createAccount, updateAccount, deleteAccount,
  fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchTransactions, createTransaction, updateTransaction, deleteTransaction, searchTransactions,
  fetchDashboard,
  fetchSplitWeights, updateSplitWeights, fetchSplitPreview, fetchBalances,
  previewImport, commitImport,
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
      body: JSON.stringify({ amount: 100, category_id: 5 }),
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

test('previewImport makes POST request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve(''),
  } as Response)

  const req = { csv_text: 'a,b\n1,2', account_id: 1, date_col: 'a', payee_col: 'b', amount_col: 'a' }
  await previewImport(req)

  expect(globalThis.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/import/preview',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(req),
    }),
  )
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
