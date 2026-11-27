import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import PendingSection from '../transactions/PendingSection'
import { Account, Category, GlobalSplitWeight, PendingTransaction, User } from '../../api/client'

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

const account = { id: 1, name: 'Joint', type: 'Checking', balance: 1000, currency: 'EUR', split_weights: [] } as unknown as Account
const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] as User[]
const globalWeights = [{ user_id: 1, weight: 1 }, { user_id: 2, weight: 1 }] as GlobalSplitWeight[]

const pending = (id: number, payee: string, amount: number, extra: Partial<PendingTransaction> = {}): PendingTransaction => ({
  id, account_id: 1, date: '2026-11-18', amount, payee, bank_payee: payee, memo: null, category_id: null,
  status: 'pending', edited: false, candidates: [], split_weights: [],
  user_payee: null, suggested_payee: null, suggested_category_id: null, suggested_split_weights: [], ...extra,
})

beforeEach(() => { vi.clearAllMocks() })

const categories = [
  { id: 7, name: 'Theatre', color: '#f00', icon: null, splits: [], type: 'Expense', parent_id: null },
] as unknown as Category[]

const renderSection = (onChanged = vi.fn()) => renderWithProviders(
  <PendingSection
    accountIds={[1]} accounts={[account]} categories={categories} users={users} globalWeights={globalWeights}
    onTransactionsChanged={onChanged}
  />,
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
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, { payee: 'Coffee', category_id: null, split_weights: null }))
})

test('a split set by hand is kept for the booked transaction', async () => {
  mockFetch.mockResolvedValue([pending(1, 'RESTAURANT', -40)])
  mockUpdate.mockResolvedValue(pending(1, 'RESTAURANT', -40, { edited: true }))
  renderSection()
  fireEvent.click(await screen.findByText('RESTAURANT'))
  fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, {
    payee: 'RESTAURANT', category_id: null, split_weights: [{ user_id: 2, weight: 1 }],
  }))
})

test('a split saved earlier opens as it was', async () => {
  mockFetch.mockResolvedValue([pending(1, 'RESTAURANT', -40, { edited: true, split_weights: [{ user_id: 1, weight: 3 }, { user_id: 2, weight: 1 }] })])
  mockUpdate.mockResolvedValue(pending(1, 'RESTAURANT', -40, { edited: true }))
  renderSection()
  fireEvent.click(await screen.findByText('RESTAURANT'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, {
    payee: 'RESTAURANT', category_id: null, split_weights: [{ user_id: 1, weight: 3 }, { user_id: 2, weight: 1 }],
  }))
})

test('a row to reconcile is applied to the picked transaction', async () => {
  const onChanged = vi.fn()
  mockFetch.mockResolvedValue([pending(4, 'Coffee', -0.58, {
    status: 'to_reconcile', edited: true, bank_payee: 'NYX',
    candidates: [{ id: 41, date: '2026-11-18', payee: 'NYX A', amount: -0.58 }, { id: 42, date: '2026-11-18', payee: 'NYX B', amount: -0.58 }],
  })])
  mockReconcile.mockResolvedValue(undefined)
  mockUpdate.mockResolvedValue(undefined)
  renderSection(onChanged)
  fireEvent.click(await screen.findByText('Coffee'))
  fireEvent.click(screen.getAllByRole('button', { name: 'This one' })[1])
  await waitFor(() => expect(mockReconcile).toHaveBeenCalledWith(4, 42))
  expect(mockUpdate).toHaveBeenCalledWith(4, { payee: 'Coffee', category_id: null, split_weights: null })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})

test('a suggestion is shown, and saving it untouched is no edit', async () => {
  mockFetch.mockResolvedValue([pending(1, 'Theatre', -9, {
    bank_payee: 'THEATRE', suggested_payee: 'Theatre', suggested_category_id: 7,
    suggested_split_weights: [{ user_id: 2, weight: 1 }],
  })])
  mockUpdate.mockResolvedValue(pending(1, 'Theatre', -9))
  renderSection()
  expect(await screen.findByLabelText('Suggested automatically')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Theatre', { selector: 'div' }))
  expect(screen.getByTestId('suggestion-note')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(1, {
    payee: 'Theatre', category_id: null, split_weights: null,
  }))
})
