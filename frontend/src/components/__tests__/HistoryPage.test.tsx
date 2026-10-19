import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import HistoryPage from '../HistoryPage'

const { mockFetchHistory, mockFetchHistoryRows } = vi.hoisted(() => ({
  mockFetchHistory: vi.fn(),
  mockFetchHistoryRows: vi.fn(),
}))

vi.mock('../../api/client', async importOriginal => ({
  historyGroupRef: (await importOriginal<typeof import('../../api/client')>()).historyGroupRef,
  fetchAccounts: () => Promise.resolve([{ id: 1, name: 'CC Joint', currency: 'EUR' }]),
  fetchCategories: () => Promise.resolve([{ id: 5, name: 'Groceries', type: 'Expense', parent_id: null }]),
  fetchUsers: () => Promise.resolve([{ id: 1, name: 'Alex' }]),
  fetchHistory: mockFetchHistory,
  fetchHistoryRows: mockFetchHistoryRows,
}))

const group = {
  first_id: 120, last_id: 21, action: 'updated', source: 'bulk', changed_by_user_id: 1, batch_id: 'abc',
  count: 100, changed_at: '2026-10-19T10:00:00', started_at: '2026-10-19T09:59:58',
  changed_by_user_name: 'Alex', transaction_id: null, date: null, payee: null, amount: null,
  account_id: null, category_id: null, changes: { category_id: { new: 5 } },
}
const single = {
  first_id: 20, last_id: 20, action: 'updated', source: null, changed_by_user_id: 1, batch_id: null,
  count: 1, changed_at: '2026-10-18T10:00:00', started_at: '2026-10-18T10:00:00',
  changed_by_user_name: 'Alex', transaction_id: 7, date: '2026-10-01', payee: 'Carrefour', amount: -12.5,
  account_id: 1, category_id: 5, changes: { payee: { old: 'CARREFOUR 123', new: 'Carrefour' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchHistory.mockResolvedValue({ items: [group, single], next_before_id: null })
  mockFetchHistoryRows.mockResolvedValue({
    items: [{ id: 120, transaction_id: 9, action: 'updated', source: 'bulk', changed_at: '2026-10-19T10:00:00',
              changed_by_user_id: 1, changed_by_user_name: 'Alex', date: '2026-09-02', payee: 'Lidl', memo: null,
              amount: -30, account_id: 1, category_id: 5, changes: { category_id: { old: null, new: 5 } } }],
    total: 100,
  })
})

test('a bulk edit is one line with its count and shared change', async () => {
  renderWithProviders(<HistoryPage onBack={vi.fn()} onOpenTransaction={vi.fn()} onOpenGroup={vi.fn()} />)
  expect(await screen.findByText('100 transactions')).toBeInTheDocument()
  expect(screen.getByText('updated · bulk edit')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('category → Groceries')).toBeInTheDocument())
  expect(screen.getByText('payee: CARREFOUR 123 → Carrefour')).toBeInTheDocument()
})

test('a group lists its transactions and opens them in Transactions', async () => {
  const onOpenGroup = vi.fn()
  const onOpenTransaction = vi.fn()
  renderWithProviders(<HistoryPage onBack={vi.fn()} onOpenTransaction={onOpenTransaction} onOpenGroup={onOpenGroup} />)
  fireEvent.click(await screen.findByText('Show transactions'))
  expect(mockFetchHistoryRows).toHaveBeenCalledWith(
    { first_id: 120, last_id: 21, action: 'updated', source: 'bulk', changed_by_user_id: 1, batch_id: 'abc' }, 0, 50)
  fireEvent.click(await screen.findByText(/Lidl/))
  expect(onOpenTransaction).toHaveBeenCalledWith(9)
  expect(screen.getByText('Show more (99 left)')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Open in Transactions'))
  expect(onOpenGroup).toHaveBeenCalledWith(
    { first_id: 120, last_id: 21, action: 'updated', source: 'bulk', changed_by_user_id: 1, batch_id: 'abc' })
})

test('filters reload the timeline from the start', async () => {
  renderWithProviders(<HistoryPage onBack={vi.fn()} onOpenTransaction={vi.fn()} onOpenGroup={vi.fn()} />)
  await screen.findByText('100 transactions')
  fireEvent.change(screen.getByLabelText('Origin'), { target: { value: 'bulk' } })
  await waitFor(() => expect(mockFetchHistory).toHaveBeenLastCalledWith(
    { beforeId: null, limit: 50, action: undefined, source: 'bulk' }))
})

test('older changes load after the current ones', async () => {
  mockFetchHistory.mockResolvedValueOnce({ items: [group], next_before_id: 21 })
  mockFetchHistory.mockResolvedValueOnce({ items: [single], next_before_id: null })
  renderWithProviders(<HistoryPage onBack={vi.fn()} onOpenTransaction={vi.fn()} onOpenGroup={vi.fn()} />)
  fireEvent.click(await screen.findByText('Show older changes'))
  expect(await screen.findByText('payee: CARREFOUR 123 → Carrefour')).toBeInTheDocument()
  expect(screen.getByText('100 transactions')).toBeInTheDocument()
  expect(mockFetchHistory).toHaveBeenLastCalledWith({ beforeId: 21, limit: 50, action: undefined, source: undefined })
})
