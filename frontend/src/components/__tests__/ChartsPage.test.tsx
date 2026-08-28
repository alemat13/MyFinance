import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ChartsPage from '../ChartsPage'

const { mockFetchCharts } = vi.hoisted(() => ({
  mockFetchCharts: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchCharts: mockFetchCharts,
}))

const sampleData = {
  currencies: ['EUR'],
  by_category: [
    { category_id: 1, category_name: 'Salary', category_type: 'Income' as const, amount: 1000, currency: 'EUR' },
    { category_id: 2, category_name: 'Rent', category_type: 'Expense' as const, amount: -300, currency: 'EUR' },
  ],
  by_month: [
    { month: '2026-01', income: 1000, expense: 300, currency: 'EUR' },
  ],
  net_by_month: [
    { month: '2026-01', net: 700, currency: 'EUR' },
  ],
}

const multiCurrencyData = {
  currencies: ['EUR', 'USD'],
  by_category: [
    { category_id: 1, category_name: 'Salary', category_type: 'Income' as const, amount: 1000, currency: 'EUR' },
    { category_id: 2, category_name: 'Freelance', category_type: 'Income' as const, amount: 200, currency: 'USD' },
  ],
  by_month: [
    { month: '2026-01', income: 1000, expense: 0, currency: 'EUR' },
    { month: '2026-01', income: 200, expense: 0, currency: 'USD' },
  ],
  net_by_month: [
    { month: '2026-01', net: 1000, currency: 'EUR' },
    { month: '2026-01', net: 200, currency: 'USD' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows a select-user message when selectedUserId is null and does not fetch', () => {
  render(<ChartsPage selectedUserId={null} onBack={() => {}} />)

  expect(screen.getByText('Select a user above to view their charts.')).toBeInTheDocument()
  expect(mockFetchCharts).not.toHaveBeenCalled()
})

test('shows loading state initially', () => {
  mockFetchCharts.mockReturnValue(new Promise(() => {}))

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('shows error state when fetch fails', async () => {
  mockFetchCharts.mockRejectedValue(new Error('API Error'))

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Error: API Error')).toBeInTheDocument()
  })
})

test('renders chart section headings on success', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Amounts by Category')).toBeInTheDocument()
  })
  expect(screen.getByText('Income vs Expense by Month')).toBeInTheDocument()
  expect(screen.getByText('Net by Month')).toBeInTheDocument()
})

test('does not show a currency selector when there is only one currency', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Amounts by Category')).toBeInTheDocument()
  })
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

test('shows a currency selector with multiple currencies', async () => {
  mockFetchCharts.mockResolvedValue(multiCurrencyData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
  const select = screen.getByRole('combobox') as HTMLSelectElement
  expect(select.value).toBe('EUR')

  fireEvent.change(select, { target: { value: 'USD' } })
  expect(select.value).toBe('USD')
})

test('refetches when selectedUserId changes', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  const { rerender } = render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenCalledWith(1)
  })

  rerender(<ChartsPage selectedUserId={2} onBack={() => {}} />)

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenCalledWith(2)
  })
})
