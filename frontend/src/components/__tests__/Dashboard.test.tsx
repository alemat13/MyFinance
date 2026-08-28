import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Dashboard from '../Dashboard'

const { mockFetchDashboard } = vi.hoisted(() => ({
  mockFetchDashboard: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchDashboard: mockFetchDashboard,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows loading state initially', () => {
  mockFetchDashboard.mockReturnValue(new Promise(() => {}))

  render(<Dashboard selectedUserId={null} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('shows error state when fetch fails', async () => {
  mockFetchDashboard.mockRejectedValue(new Error('API Error'))

  render(<Dashboard selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Error: API Error')).toBeInTheDocument()
  })
})

test('renders accounts and recent transactions on success', async () => {
  mockFetchDashboard.mockResolvedValue({
    accounts: [{ id: 1, name: 'Checking', type: 'Checking', balance: 100, currency: 'EUR', created_at: '2026-01-01', users: [] }],
    recent_transactions: [{ id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'EUR', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', splits: [] }],
    balances: [],
  })

  render(<Dashboard selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Checking' })).toBeInTheDocument()
  })
  expect(screen.getByText('Test')).toBeInTheDocument()
})

test('renders the balance widget when balances are present', async () => {
  mockFetchDashboard.mockResolvedValue({
    accounts: [],
    recent_transactions: [],
    balances: [
      { user_id: 1, user_name: 'Alex', currency: 'EUR', net_position: -50 },
      { user_id: 2, user_name: 'Olivia', currency: 'EUR', net_position: 50 },
    ],
  })

  render(<Dashboard selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/Alex owes Olivia/)).toBeInTheDocument()
  })
})
