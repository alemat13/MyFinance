import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchAccounts, createAccount, updateAccount, deleteAccount,
  fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchTransactions, createTransaction, updateTransaction, deleteTransaction,
  fetchDashboard,
} from '../client'

beforeEach(() => {
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('fetchAccounts makes GET request', async () => {
  const mockData = [{ id: 1, name: 'A', type: 'Checking', balance: 100, created_at: '2026-01-01' }]
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchAccounts()

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toEqual(mockData)
})

test('createAccount makes POST request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: 1, name: 'A', type: 'Checking', balance: 0, created_at: '2026-01-01' }),
    text: () => Promise.resolve(''),
  } as Response)

  await createAccount({ name: 'A', type: 'Checking' })

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'A', type: 'Checking' }),
    }),
  )
})

test('updateAccount makes PUT request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: 1, name: 'B', type: 'Checking', balance: 0, created_at: '2026-01-01' }),
    text: () => Promise.resolve(''),
  } as Response)

  await updateAccount(1, { name: 'B' })

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts/1',
    expect.objectContaining({
      method: 'PUT',
    }),
  )
})

test('deleteAccount makes DELETE request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  await deleteAccount(1)

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/accounts/1',
    expect.objectContaining({
      method: 'DELETE',
    }),
  )
})

test('fetchCategories makes GET request', async () => {
  const mockData = [{ id: 1, name: 'Salary', type: 'Income' }]
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchCategories()

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toEqual(mockData)
})

test('createCategory makes POST request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: 1, name: 'Food', type: 'Expense' }),
    text: () => Promise.resolve(''),
  } as Response)

  await createCategory({ name: 'Food', type: 'Expense' })

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Food', type: 'Expense' }),
    }),
  )
})

test('updateCategory makes PUT request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await updateCategory(1, { name: 'Food' })

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories/1',
    expect.objectContaining({
      method: 'PUT',
    }),
  )
})

test('deleteCategory makes DELETE request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  await deleteCategory(1)

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/categories/1',
    expect.objectContaining({
      method: 'DELETE',
    }),
  )
})

test('fetchTransactions makes GET request', async () => {
  const mockData = [{ id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'A', category_id: 1, category_name: 'C' }]
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchTransactions()

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toHaveLength(1)
})

test('createTransaction makes POST request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await createTransaction({ date: '2026-01-15', payee: 'Test', amount: 50, account_id: 1, category_id: 1 })

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-15', payee: 'Test', amount: 50, account_id: 1, category_id: 1 }),
    }),
  )
})

test('updateTransaction makes PUT request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  } as Response)

  await updateTransaction(1, { payee: 'Updated' })

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/1',
    expect.objectContaining({
      method: 'PUT',
    }),
  )
})

test('deleteTransaction makes DELETE request', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  await deleteTransaction(1)

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/transactions/1',
    expect.objectContaining({
      method: 'DELETE',
    }),
  )
})

test('fetchDashboard makes GET request', async () => {
  const mockData = { accounts: [], recent_transactions: [] }
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockData),
    text: () => Promise.resolve(''),
  } as Response)

  const result = await fetchDashboard()

  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/dashboard',
    expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  expect(result).toEqual(mockData)
})

test('request handles 204 No Content', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    status: 204,
    text: () => Promise.resolve(''),
  } as Response)

  const result = await deleteAccount(1)

  expect(result).toBeUndefined()
})

test('request throws on non-ok response', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: false,
    status: 404,
    text: () => Promise.resolve('Not Found'),
  } as Response)

  await expect(fetchAccounts()).rejects.toThrow('Not Found')
})

test('request throws on non-ok without body', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: false,
    status: 500,
    text: () => Promise.resolve(''),
  } as Response)

  await expect(fetchAccounts()).rejects.toThrow('500')
})
