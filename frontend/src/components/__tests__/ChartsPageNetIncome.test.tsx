import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ChartsPage from '../ChartsPage'

const { mockFetchCharts, mockFetchCategories } = vi.hoisted(() => ({
  mockFetchCharts: vi.fn(),
  mockFetchCategories: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchCharts: mockFetchCharts,
  fetchCategories: mockFetchCategories,
}))

// recharts draws nothing in jsdom, so the chart is stood in for by buttons
// calling what a click on a bar or a legend entry calls.
vi.mock('../charts/NetIncomeByMonthChart', () => ({
  default: ({ onOpenTransactions }: { onOpenTransactions: (kind: string, month: string | null) => void }) => (
    <div>
      <button onClick={() => onOpenTransactions('Income', '2026-01')}>Income bar</button>
      <button onClick={() => onOpenTransactions('Uncategorized', null)}>Uncategorized legend</button>
    </div>
  ),
}))

const data = {
  currencies: ['EUR'],
  by_category: [],
  by_month: [{ month: '2026-01', income: 1000, expense: 300, uncategorized: 0, currency: 'EUR' }],
  net_by_month: [{ month: '2026-01', net: 700, currency: 'EUR' }],
  by_month_category: [],
  chart_categories: [],
  parent_category: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/?start_month=2026-01&end_month=2026-03')
  mockFetchCharts.mockResolvedValue(data)
  mockFetchCategories.mockResolvedValue([
    { id: 1, name: 'Salary', type: 'Income', parent_id: null },
    { id: 2, name: 'Rent', type: 'Expense', parent_id: null },
    { id: 7, name: 'Bonus', type: 'Income', parent_id: 1 },
  ])
})

test('an Income bar opens every Income category, subcategories included, for its month', async () => {
  const onOpenTransactions = vi.fn()
  render(<ChartsPage selectedUserId={1} onBack={() => {}} onOpenTransactions={onOpenTransactions} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Income bar' }))

  await waitFor(() => expect(onOpenTransactions).toHaveBeenCalled())
  expect(onOpenTransactions).toHaveBeenCalledWith([
    { field: 'category_id', operator: 'in', value: '1,7', value2: '' },
    { field: 'accounting_month', operator: 'on', value: '2026-01', value2: '' },
    { field: 'split_weight', operator: 'gt', value: '0', value2: '', userId: '1' },
  ])
})

test('the Uncategorized legend entry opens the uncategorized rows over the whole range', async () => {
  const onOpenTransactions = vi.fn()
  render(<ChartsPage selectedUserId={1} onBack={() => {}} onOpenTransactions={onOpenTransactions} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Uncategorized legend' }))

  await waitFor(() => expect(onOpenTransactions).toHaveBeenCalled())
  expect(onOpenTransactions.mock.calls[0][0].slice(0, 2)).toEqual([
    { field: 'category_id', operator: 'in', value: '-1', value2: '' },
    { field: 'accounting_month', operator: 'between', value: '2026-01', value2: '2026-03' },
  ])
  expect(mockFetchCategories).not.toHaveBeenCalled()
})
