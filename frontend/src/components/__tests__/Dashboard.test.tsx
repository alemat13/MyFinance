import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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
    recent_transactions: [{ id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'EUR', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false, splits: [] }],
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

test('clicking an account tile calls onSelectAccount with that account id', async () => {
  const onSelectAccount = vi.fn()
  mockFetchDashboard.mockResolvedValue({
    accounts: [{ id: 7, name: 'Joint Checking', type: 'Checking', balance: 100, currency: 'EUR', created_at: '2026-01-01', users: [] }],
    recent_transactions: [],
    balances: [],
  })

  render(<Dashboard selectedUserId={null} onSelectAccount={onSelectAccount} />)

  await waitFor(() => expect(screen.getByRole('heading', { name: 'Joint Checking' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'View transactions for Joint Checking' }))

  expect(onSelectAccount).toHaveBeenCalledWith(7)
})

test("shows the selected user's net worth, by account type, under recent transactions", async () => {
  const onSelectAccount = vi.fn()
  mockFetchDashboard.mockResolvedValue({
    accounts: [
      { id: 1, name: 'Joint', type: 'Checking', balance: 1000, currency: 'EUR', created_at: '2026-01-01', users: [
        { user_id: 1, user_name: 'Alex', ownership_percentage: 50 },
        { user_id: 2, user_name: 'Olivia', ownership_percentage: 50 },
      ] },
      { id: 2, name: 'PEA', type: 'Investment', balance: 5000, currency: 'EUR', created_at: '2026-01-01', users: [
        { user_id: 1, user_name: 'Alex', ownership_percentage: 100 },
      ] },
    ],
    recent_transactions: [],
    balances: [{ user_id: 1, user_name: 'Alex', currency: 'EUR', net_position: -50 }],
  })

  render(<Dashboard selectedUserId={1} onSelectAccount={onSelectAccount} />)

  const card = await screen.findByTestId('net-worth-EUR')
  expect(screen.getByRole('heading', { name: 'Net worth' })).toBeInTheDocument()
  expect(card).toHaveTextContent('50% of €1,000.00')
  expect(card).toHaveTextContent('You owe (Balance)')
  expect(card).toHaveTextContent('€5,450.00')
  fireEvent.click(within(card).getByRole('button', { name: /Joint/ }))
  expect(onSelectAccount).toHaveBeenCalledWith(1)
  fireEvent.click(within(card).getByRole('button', { name: /Checking/ }))
  expect(within(card).queryByRole('button', { name: /Joint/ })).not.toBeInTheDocument()
})
