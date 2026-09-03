import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import BulkEditModal from '../BulkEditModal'

const { mockBulkUpdateTransactions } = vi.hoisted(() => ({
  mockBulkUpdateTransactions: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  bulkUpdateTransactions: mockBulkUpdateTransactions,
}))

const baseCategory = { id: 1, name: 'Salary', type: 'Income', splits: [] }
const baseUsers = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
const baseTxns = [
  { id: 1, date: '2026-01-15', payee: 'Coffee', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', splits: [] },
  { id: 2, date: '2026-01-16', payee: 'Lunch', memo: null, amount: 75, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', splits: [] },
]

const baseProps = {
  transactionIds: [1, 2],
  transactions: baseTxns,
  accounts: [],
  categories: [baseCategory],
  allUsers: baseUsers,
  globalWeights: [],
  selectedUserId: null,
  onClose: vi.fn(),
  onSaved: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

function submitButton() {
  return screen.getByText('Apply to 2 transactions').closest('button')!
}

test('submit is disabled when no section is toggled on', () => {
  renderWithProviders(<BulkEditModal {...baseProps} />)
  expect(submitButton()).toBeDisabled()
})

test('toggling only the category section sends only category_id in the update payload', async () => {
  mockBulkUpdateTransactions.mockResolvedValue({ updated_count: 2, transaction_ids: [1, 2] })
  renderWithProviders(<BulkEditModal {...baseProps} />)

  fireEvent.click(screen.getByText('Change category'))
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.click(screen.getByText('Salary'))
  fireEvent.click(submitButton())

  await waitFor(() => expect(mockBulkUpdateTransactions).toHaveBeenCalled())
  expect(mockBulkUpdateTransactions).toHaveBeenCalledWith([1, 2], { category_id: 1 }, null)
})

test('toggling only the accounting-month section sends only accounting_month_offset', async () => {
  mockBulkUpdateTransactions.mockResolvedValue({ updated_count: 2, transaction_ids: [1, 2] })
  renderWithProviders(<BulkEditModal {...baseProps} />)

  fireEvent.click(screen.getByText('Shift accounting month'))
  fireEvent.change(screen.getByText('No shift').closest('select')!, { target: { value: '1' } })
  fireEvent.click(submitButton())

  await waitFor(() => expect(mockBulkUpdateTransactions).toHaveBeenCalled())
  expect(mockBulkUpdateTransactions).toHaveBeenCalledWith([1, 2], { accounting_month_offset: 1 }, null)
})

test('toggling only the split section sends split_weights and split_source custom', async () => {
  mockBulkUpdateTransactions.mockResolvedValue({ updated_count: 2, transaction_ids: [1, 2] })
  renderWithProviders(<BulkEditModal {...baseProps} />)

  fireEvent.click(screen.getByText('Apply new split'))
  fireEvent.click(screen.getByText('Split Evenly'))
  fireEvent.click(submitButton())

  await waitFor(() => expect(mockBulkUpdateTransactions).toHaveBeenCalled())
  expect(mockBulkUpdateTransactions).toHaveBeenCalledWith(
    [1, 2],
    {
      split_weights: [{ user_id: 1, weight: 1 }, { user_id: 2, weight: 1 }],
      split_source: 'custom',
    },
    null,
  )
})

test('toggling all three sections sends all three fields together', async () => {
  mockBulkUpdateTransactions.mockResolvedValue({ updated_count: 2, transaction_ids: [1, 2] })
  renderWithProviders(<BulkEditModal {...baseProps} />)

  fireEvent.click(screen.getByText('Change category'))
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.click(screen.getByText('Salary'))

  fireEvent.click(screen.getByText('Shift accounting month'))
  fireEvent.change(screen.getByText('No shift').closest('select')!, { target: { value: '-1' } })

  fireEvent.click(screen.getByText('Apply new split'))
  fireEvent.click(screen.getByText('Split Evenly'))

  fireEvent.click(submitButton())

  await waitFor(() => expect(mockBulkUpdateTransactions).toHaveBeenCalled())
  expect(mockBulkUpdateTransactions).toHaveBeenCalledWith(
    [1, 2],
    {
      category_id: 1,
      accounting_month_offset: -1,
      split_weights: [{ user_id: 1, weight: 1 }, { user_id: 2, weight: 1 }],
      split_source: 'custom',
    },
    null,
  )
})

test('selecting Uncategorized while the category toggle is on sends category_id: null (not omitted)', async () => {
  mockBulkUpdateTransactions.mockResolvedValue({ updated_count: 2, transaction_ids: [1, 2] })
  renderWithProviders(<BulkEditModal {...baseProps} />)

  fireEvent.click(screen.getByText('Change category'))
  fireEvent.click(screen.getByText('Uncategorized'))
  // Two "Uncategorized" texts are visible once open: the trigger's own
  // placeholder badge, and the dropdown's own option — click the latter.
  fireEvent.click(screen.getAllByText('Uncategorized')[1])
  fireEvent.click(submitButton())

  await waitFor(() => expect(mockBulkUpdateTransactions).toHaveBeenCalled())
  expect(mockBulkUpdateTransactions).toHaveBeenCalledWith([1, 2], { category_id: null }, null)
})

test('on success shows a toast and calls onSaved', async () => {
  mockBulkUpdateTransactions.mockResolvedValue({ updated_count: 2, transaction_ids: [1, 2] })
  const onSaved = vi.fn()
  renderWithProviders(<BulkEditModal {...baseProps} onSaved={onSaved} />)

  fireEvent.click(screen.getByText('Change category'))
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.click(screen.getByText('Salary'))
  fireEvent.click(submitButton())

  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(await screen.findByText('2 transaction(s) updated')).toBeInTheDocument()
})

test('on API error shows an error toast and keeps the modal open', async () => {
  mockBulkUpdateTransactions.mockRejectedValue(new Error('Something broke'))
  const onSaved = vi.fn()
  renderWithProviders(<BulkEditModal {...baseProps} onSaved={onSaved} />)

  fireEvent.click(screen.getByText('Change category'))
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.click(screen.getByText('Salary'))
  fireEvent.click(submitButton())

  expect(await screen.findByText('Something broke')).toBeInTheDocument()
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Bulk Edit Transactions' })).toBeInTheDocument()
})

test('account/category quick-fill buttons are disabled in the split section while Split Evenly is not', () => {
  renderWithProviders(<BulkEditModal {...baseProps} />)

  fireEvent.click(screen.getByText('Apply new split'))

  expect(screen.getByText('Account').closest('button')).toBeDisabled()
  expect(screen.getByText('Category').closest('button')).toBeDisabled()
  expect(screen.getByText('Split Evenly').closest('button')).not.toBeDisabled()
})
