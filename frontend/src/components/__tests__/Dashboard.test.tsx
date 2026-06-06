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

  render(<Dashboard />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('shows error state when fetch fails', async () => {
  mockFetchDashboard.mockRejectedValue(new Error('API Error'))

  render(<Dashboard />)

  await waitFor(() => {
    expect(screen.getByText('Error: API Error')).toBeInTheDocument()
  })
})

test('renders accounts and recent transactions on success', async () => {
  mockFetchDashboard.mockResolvedValue({
    accounts: [{ id: 1, name: 'Checking', type: 'Checking', balance: 100, created_at: '2026-01-01' }],
    recent_transactions: [{ id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', category_id: 1, category_name: 'Salary' }],
  })

  render(<Dashboard />)

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Checking' })).toBeInTheDocument()
  })
  expect(screen.getByText('Test')).toBeInTheDocument()
})
