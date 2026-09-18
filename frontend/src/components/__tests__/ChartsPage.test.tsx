import { test, expect, vi, beforeEach, afterEach } from 'vitest'
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
  by_category: [],
  by_month: [
    { month: '2026-01', income: 1000, expense: 300, uncategorized: 0, currency: 'EUR' },
  ],
  net_by_month: [
    { month: '2026-01', net: 700, currency: 'EUR' },
  ],
  by_month_category: [
    { month: '2026-01', category_id: 2, amount: -300, currency: 'EUR' },
  ],
  chart_categories: [
    { category_id: 2, name: 'Rent', color: '#dc2626', icon: null },
  ],
  parent_category: null,
}

const drilledData = {
  ...sampleData,
  by_month_category: [{ month: '2026-01', category_id: 5, amount: -100, currency: 'EUR' }],
  chart_categories: [{ category_id: 5, name: 'Electricity', color: '#dc2626', icon: null }],
  parent_category: { id: 2, name: 'Rent' },
}

const multiCurrencyData = {
  currencies: ['EUR', 'USD'],
  by_category: [],
  by_month: [
    { month: '2026-01', income: 1000, expense: 0, uncategorized: 0, currency: 'EUR' },
    { month: '2026-01', income: 200, expense: 0, uncategorized: 0, currency: 'USD' },
  ],
  net_by_month: [
    { month: '2026-01', net: 1000, currency: 'EUR' },
    { month: '2026-01', net: 200, currency: 'USD' },
  ],
  by_month_category: [
    { month: '2026-01', category_id: 2, amount: -50, currency: 'EUR' },
    { month: '2026-01', category_id: 3, amount: -20, currency: 'USD' },
  ],
  chart_categories: [
    { category_id: 2, name: 'Rent', color: '#dc2626', icon: null },
    { category_id: 3, name: 'Groceries', color: '#16a34a', icon: null },
  ],
  parent_category: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date('2026-09-18T12:00:00Z'))
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
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

test('renders both chart headings on success', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Spending per month')).toBeInTheDocument()
  })
  expect(screen.getByText('Net income per month')).toBeInTheDocument()
})

test('defaults the date range to the last 12 months', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenCalledWith(1, expect.objectContaining({
      startMonth: '2025-10',
      endMonth: '2026-09',
    }))
  })
})

test('changing the From/To inputs triggers a refetch with the new range', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)
  await waitFor(() => expect(mockFetchCharts).toHaveBeenCalled())

  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01' } })

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenLastCalledWith(1, expect.objectContaining({ startMonth: '2026-01' }))
  })
})

test('does not show a currency selector when there is only one currency', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Spending per month')).toBeInTheDocument()
  })
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

test('shows a currency selector with multiple currencies and filters client-side without refetching', async () => {
  mockFetchCharts.mockResolvedValue(multiCurrencyData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
  const select = screen.getByRole('combobox') as HTMLSelectElement
  expect(select.value).toBe('EUR')
  expect(screen.getByRole('button', { name: 'Rent' })).toBeInTheDocument()

  const callsBefore = mockFetchCharts.mock.calls.length
  fireEvent.change(select, { target: { value: 'USD' } })

  expect(select.value).toBe('USD')
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Groceries' })).toBeInTheDocument()
  })
  expect(screen.queryByRole('button', { name: 'Rent' })).not.toBeInTheDocument()
  // Switching currency only re-filters the already-fetched data - it never
  // triggers another network request.
  expect(mockFetchCharts.mock.calls.length).toBe(callsBefore)
})

test('shows a non-interactive Uncategorized legend entry', async () => {
  mockFetchCharts.mockResolvedValue({
    ...sampleData,
    by_month_category: [
      ...sampleData.by_month_category,
      { month: '2026-01', category_id: null, amount: -20, currency: 'EUR' },
    ],
    chart_categories: [
      ...sampleData.chart_categories,
      { category_id: null, name: 'Uncategorized', color: null, icon: null },
    ],
  })

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  const button = await screen.findByRole('button', { name: 'Uncategorized' })
  expect(button).toBeDisabled()

  const callsBefore = mockFetchCharts.mock.calls.length
  fireEvent.click(button)
  expect(mockFetchCharts.mock.calls.length).toBe(callsBefore)
})

test('clicking a category legend entry drills in and shows a breadcrumb', async () => {
  mockFetchCharts.mockResolvedValueOnce(sampleData).mockResolvedValueOnce(drilledData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  const rentButton = await screen.findByRole('button', { name: 'Rent' })
  fireEvent.click(rentButton)

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenLastCalledWith(1, expect.objectContaining({ parentCategoryId: 2 }))
  })
  expect(await screen.findByText('Rent')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Electricity' })).toBeInTheDocument()
})

test('clicking Overview clears the drilldown and refetches the overview', async () => {
  mockFetchCharts.mockResolvedValueOnce(sampleData).mockResolvedValueOnce(drilledData).mockResolvedValueOnce(sampleData)

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  const rentButton = await screen.findByRole('button', { name: 'Rent' })
  fireEvent.click(rentButton)

  const overviewButton = await screen.findByRole('button', { name: 'Overview' })
  fireEvent.click(overviewButton)

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenLastCalledWith(1, expect.objectContaining({ parentCategoryId: undefined }))
  })
  expect(await screen.findByRole('button', { name: 'Rent' })).toBeInTheDocument()
})

test('shows independent empty states per chart', async () => {
  mockFetchCharts.mockResolvedValue({
    ...multiCurrencyData,
    currencies: ['EUR'],
    by_month: [{ month: '2026-01', income: 1000, expense: 0, uncategorized: 0, currency: 'EUR' }],
    net_by_month: [{ month: '2026-01', net: 1000, currency: 'EUR' }],
    by_month_category: [],
    chart_categories: [],
  })

  render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No spending data for this range.')).toBeInTheDocument()
  })
  expect(screen.queryByText('No income or expense data for this range.')).not.toBeInTheDocument()
})

test('refetches when selectedUserId changes', async () => {
  mockFetchCharts.mockResolvedValue(sampleData)

  const { rerender } = render(<ChartsPage selectedUserId={1} onBack={() => {}} />)

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenCalledWith(1, expect.anything())
  })

  rerender(<ChartsPage selectedUserId={2} onBack={() => {}} />)

  await waitFor(() => {
    expect(mockFetchCharts).toHaveBeenCalledWith(2, expect.anything())
  })
})
