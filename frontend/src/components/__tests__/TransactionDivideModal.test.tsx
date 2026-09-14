import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import TransactionDivideModal from '../TransactionDivideModal'

const { mockDivideTransaction } = vi.hoisted(() => ({
  mockDivideTransaction: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  divideTransaction: mockDivideTransaction,
}))

const baseCategory = { id: 1, name: 'Groceries', type: 'Expense', splits: [] }
const otherCategory = { id: 2, name: 'Party', type: 'Expense', splits: [] }

const baseTransaction = {
  id: 1, date: '2026-01-15', payee: 'Shopping', memo: null, amount: 50, account_id: 1,
  account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Groceries',
  accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false,
  divide_group_id: null, splits: [],
}

const baseProps = {
  transaction: baseTransaction,
  categories: [baseCategory, otherCategory],
  selectedUserId: null,
  onClose: vi.fn(),
  onDivided: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

function amountInputs() {
  return screen.getAllByPlaceholderText('Amount') as HTMLInputElement[]
}

test('seeds two part rows from the original transaction, first keeping the full amount', () => {
  renderWithProviders(<TransactionDivideModal {...baseProps} />)

  const amounts = amountInputs()
  expect(amounts).toHaveLength(2)
  expect(amounts[0].value).toBe('50')
  expect(amounts[1].value).toBe('0')
  expect(screen.getAllByPlaceholderText('Payee')[0]).toHaveValue('Shopping')
})

test('Divide button is disabled until the parts add up to the original amount', () => {
  renderWithProviders(<TransactionDivideModal {...baseProps} />)

  const divideButton = screen.getByText('Divide').closest('button')!
  expect(divideButton).toBeDisabled()

  const amounts = amountInputs()
  fireEvent.change(amounts[0], { target: { value: '30' } })
  fireEvent.change(amounts[1], { target: { value: '20' } })

  expect(divideButton).not.toBeDisabled()
})

test('Add part appends a new row, and Remove is disabled at the two-row minimum', () => {
  renderWithProviders(<TransactionDivideModal {...baseProps} />)

  expect(amountInputs()).toHaveLength(2)
  fireEvent.click(screen.getByText('Add part'))
  expect(amountInputs()).toHaveLength(3)

  const removeButtons = screen.getAllByLabelText('Remove part')
  fireEvent.click(removeButtons[0])
  expect(amountInputs()).toHaveLength(2)
  // At the 2-row minimum, remove is disabled rather than allowing a single part.
  expect(screen.getAllByLabelText('Remove part')[0]).toBeDisabled()
})

test('submits parts summing to the original amount and calls onDivided with the response', async () => {
  mockDivideTransaction.mockResolvedValue({
    transactions: [{ ...baseTransaction, amount: 30 }, { ...baseTransaction, id: 2, amount: 20, payee: 'Party' }],
  })
  const onDivided = vi.fn()
  renderWithProviders(<TransactionDivideModal {...baseProps} onDivided={onDivided} />)

  const amounts = amountInputs()
  fireEvent.change(amounts[0], { target: { value: '30' } })
  fireEvent.change(amounts[1], { target: { value: '20' } })
  const payees = screen.getAllByPlaceholderText('Payee')
  fireEvent.change(payees[1], { target: { value: 'Party' } })

  fireEvent.click(screen.getByText('Divide').closest('button')!)

  await waitFor(() => expect(mockDivideTransaction).toHaveBeenCalled())
  const [id, payload] = mockDivideTransaction.mock.calls[0]
  expect(id).toBe(1)
  expect(payload.parts).toHaveLength(2)
  expect(payload.parts[0].amount).toBe(30)
  expect(payload.parts[1].amount).toBe(20)
  expect(payload.parts[1].payee).toBe('Party')

  await waitFor(() => expect(onDivided).toHaveBeenCalledWith([
    { ...baseTransaction, amount: 30 },
    { ...baseTransaction, id: 2, amount: 20, payee: 'Party' },
  ]))
})

test('shows an error toast and does not call onDivided when the request fails', async () => {
  mockDivideTransaction.mockRejectedValue(new Error('Part amounts must sum to the original amount'))
  const onDivided = vi.fn()
  renderWithProviders(<TransactionDivideModal {...baseProps} onDivided={onDivided} />)

  const amounts = amountInputs()
  fireEvent.change(amounts[0], { target: { value: '30' } })
  fireEvent.change(amounts[1], { target: { value: '20' } })

  fireEvent.click(screen.getByText('Divide').closest('button')!)

  expect(await screen.findByText('Part amounts must sum to the original amount')).toBeInTheDocument()
  expect(onDivided).not.toHaveBeenCalled()
})

test('Cancel calls onClose without submitting', () => {
  const onClose = vi.fn()
  renderWithProviders(<TransactionDivideModal {...baseProps} onClose={onClose} />)

  fireEvent.click(screen.getByText('Cancel'))

  expect(onClose).toHaveBeenCalled()
  expect(mockDivideTransaction).not.toHaveBeenCalled()
})
