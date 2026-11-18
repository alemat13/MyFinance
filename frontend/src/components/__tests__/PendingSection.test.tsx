import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import PendingSection from '../transactions/PendingSection'
import { Account, PendingTransaction } from '../../api/client'

const { mockFetch, mockUpdate, mockReconcile, mockDismiss } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockUpdate: vi.fn(),
  mockReconcile: vi.fn(),
  mockDismiss: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchPendingTransactions: mockFetch,
  updatePendingTransaction: mockUpdate,
  reconcilePendingTransaction: mockReconcile,
  dismissPendingTransaction: mockDismiss,
}))

const account = { id: 1, name: 'Joint', type: 'Checking', balance: 1000, currency: 'EUR' } as Account

const pending = (id: number, payee: string, amount: number, extra: Partial<PendingTransaction> = {}): PendingTransaction => ({
  id, account_id: 1, date: '2026-11-18', amount, payee, bank_payee: payee, memo: null, category_id: null,
  status: 'pending', edited: false, candidates: [], ...extra,
})

beforeEach(() => { vi.clearAllMocks() })

const renderSection = (onChanged = vi.fn()) => renderWithProviders(
  <PendingSection accountIds={[1]} accounts={[account]} categories={[]} onTransactionsChanged={onChanged} />,
)

test('shows nothing when the bank reports nothing pending', async () => {
  mockFetch.mockResolvedValue([])
  const { container } = renderSection()
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith([1]))
  expect(container).toBeEmptyDOMElement()
})

test('lists pending rows with the projected balance, leaving rows to reconcile out of it', async () => {
  mockFetch.mockResolvedValue([
    pending(1, 'THEATRE', -9),
    pending(2, 'TRANSFER', 500),
    pending(3, 'DEPOSIT', -300, { status: 'to_reconcile', edited: true }),
  ])
  renderSection()
  expect(await screen.findByText('Pending (2)')).toBeInTheDocument()
  expect(screen.getByText('1 to reconcile')).toBeInTheDocument()
  expect(screen.getByTestId('projected-balance')).toHaveTextContent('1,491.00')
})

test('saves the payee for when the bank books it', async () => {
  mockFetch.mockResolvedValue([pending(1, 'NYX*NESHU', -0.58)])
  mockUpdate.mockResolvedValue(pending(1, 'Coffee', -0.58, { edited: true }))
  renderSection()
  fireEvent.click(await screen.findByText('NYX*NESHU'))
  fireEvent.change(screen.getByDisplayValue('NYX*NESHU'), { target: { value: 'Coffee' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { payee: 'Coffee', category_id: null }))
})

test('a row to reconcile is applied to the picked transaction', async () => {
  const onChanged = vi.fn()
  mockFetch.mockResolvedValue([pending(4, 'Coffee', -0.58, {
    status: 'to_reconcile', edited: true, bank_payee: 'NYX',
    candidates: [{ id: 41, date: '2026-11-18', payee: 'NYX A', amount: -0.58 }, { id: 42, date: '2026-11-18', payee: 'NYX B', amount: -0.58 }],
  })])
  mockReconcile.mockResolvedValue(undefined)
  renderSection(onChanged)
  fireEvent.click(await screen.findByText('Coffee'))
  fireEvent.click(screen.getAllByRole('button', { name: 'This one' })[1])
  await waitFor(() => expect(mockReconcile).toHaveBeenCalledWith(4, 42))
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})
