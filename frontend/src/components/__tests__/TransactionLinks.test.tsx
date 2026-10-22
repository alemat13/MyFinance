import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import LinkTransactionsModal from '../LinkTransactionsModal'
import TransactionLinkSection from '../TransactionLinkSection'
import { Transaction } from '../../api/client'

const { mockCreate, mockFetch, mockRename, mockUnlink, mockDelete } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFetch: vi.fn(),
  mockRename: vi.fn(),
  mockUnlink: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  createTransactionLink: mockCreate,
  fetchTransactionLink: mockFetch,
  renameTransactionLink: mockRename,
  unlinkTransactions: mockUnlink,
  deleteTransactionLink: mockDelete,
}))

const txn = (id: number, payee: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, date: `2026-03-${10 + id}`, payee, memo: null, amount, account_id: 1, account_name: 'Checking', currency: 'EUR',
  category_id: null, category_name: null, accounting_month_offset: 0, accounting_month: '2026-03',
  reconciled: false, divide_group_id: null, splits: [], ...extra,
})

const doctor = txn(1, 'Dr Martin', -60, { link_id: 7 })
const cpam = txn(2, 'CPAM', 42, { link_id: 7 })
const mgen = txn(3, 'MGEN', 12, { link_id: 7 })
const group = { id: 7, name: 'Dentist', transactions: [doctor, cpam, mgen], totals: [{ currency: 'EUR', amount: -6 }] }

beforeEach(() => {
  vi.clearAllMocks()
})

test('the link modal shows the net and links the selection with its name', async () => {
  mockCreate.mockResolvedValue(group)
  const onLinked = vi.fn()
  renderWithProviders(
    <LinkTransactionsModal
      transactions={[txn(1, 'Dr Martin', -60), txn(2, 'CPAM', 42)]}
      selectedUserId={4}
      onClose={() => {}}
      onLinked={onLinked}
    />,
  )
  expect(screen.getByText('-€18.00')).toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText('e.g. Dentist March'), { target: { value: ' Dentist ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Link' }))
  await waitFor(() => expect(onLinked).toHaveBeenCalled())
  expect(mockCreate).toHaveBeenCalledWith([1, 2], 'Dentist', 4)
})

test('the link modal says when a ticked row already belongs to a group', () => {
  renderWithProviders(
    <LinkTransactionsModal
      transactions={[txn(1, 'A', -10, { link_id: 3 }), txn(2, 'B', 10)]}
      selectedUserId={null}
      onClose={() => {}}
      onLinked={() => {}}
    />,
  )
  expect(screen.getByText(/One of them is already linked/)).toBeInTheDocument()
})

test('the detail section lists the group and its net, and navigates to a member', async () => {
  mockFetch.mockResolvedValue(group)
  const onNavigate = vi.fn()
  renderWithProviders(
    <TransactionLinkSection transaction={doctor} actorUserId={null} onNavigateToTransaction={onNavigate} onChanged={() => {}} />,
  )
  expect(await screen.findByText('Linked: Dentist (3)')).toBeInTheDocument()
  expect(screen.getByText('Net: -€6.00')).toBeInTheDocument()
  fireEvent.click(screen.getByText('CPAM'))
  expect(onNavigate).toHaveBeenCalledWith(2)
})

test('unlinking this one reports the transaction as no longer linked', async () => {
  mockFetch.mockResolvedValue(group)
  mockUnlink.mockResolvedValue({ ...group, transactions: [cpam, mgen] })
  const onChanged = vi.fn()
  renderWithProviders(
    <TransactionLinkSection transaction={doctor} actorUserId={2} onChanged={onChanged} />,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Unlink this one' }))
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith(null))
  expect(mockUnlink).toHaveBeenCalledWith(7, [1], 2)
})

test('the group can be renamed', async () => {
  mockFetch.mockResolvedValue(group)
  mockRename.mockResolvedValue({ ...group, name: 'Teeth' })
  renderWithProviders(<TransactionLinkSection transaction={doctor} actorUserId={null} onChanged={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Rename the group' }))
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Teeth' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Linked: Teeth (3)')).toBeInTheDocument()
  expect(mockRename).toHaveBeenCalledWith(7, 'Teeth')
})

test('a transaction that is not linked shows no section', () => {
  const { container } = renderWithProviders(
    <TransactionLinkSection transaction={txn(9, 'Alone', 5)} actorUserId={null} onChanged={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
  expect(mockFetch).not.toHaveBeenCalled()
})


test('the link modal prefills the name with the text the payees share', () => {
  renderWithProviders(
    <LinkTransactionsModal
      transactions={[txn(1, 'Virement vers Livret A', -500), txn(2, 'VIREMENT depuis Joint', 500)]}
      selectedUserId={null}
      onClose={() => {}}
      onLinked={() => {}}
    />,
  )
  expect(screen.getByPlaceholderText('e.g. Dentist March')).toHaveValue('Virement')
})
