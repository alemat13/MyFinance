import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import RulesApplyModal from '../RulesApplyModal'

const mocks = vi.hoisted(() => ({
  fetchRules: vi.fn(),
  previewRules: vi.fn(),
  applyRules: vi.fn(),
}))

vi.mock('../../api/client', () => mocks)

const transactions = [
  { id: 11, payee: 'PRLV SFR', amount: -20, currency: 'EUR' },
  { id: 12, payee: 'Navigo', amount: -88.8, currency: 'EUR' },
] as never[]

const outcome = {
  rule_ids: [1], rule_names: ['SFR'], payee: 'SFR', category_id: 3, category_name: 'Phone',
  accounting_month_offset: null, reconciled: null, split_weights: null, split_source: null,
}

const item = (id: number, payee: string, o: unknown) => ({
  transaction_id: id, date: '2026-08-01', payee, amount: -20, current_category_id: null,
  current_category_name: null, current_accounting_month_offset: 0, current_reconciled: false, outcome: o,
})

function render(onApplied = () => {}) {
  return renderWithProviders(
    <RulesApplyModal transactionIds={[11, 12]} transactions={transactions} allUsers={[]} selectedUserId={1}
                     onClose={() => {}} onApplied={onApplied} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchRules.mockResolvedValue([
    { id: 1, name: 'SFR', enabled: true, position: 0 },
    { id: 2, name: 'Trial', enabled: false, position: 1 },
  ])
  mocks.previewRules.mockResolvedValue({ items: [item(11, 'PRLV SFR', outcome), item(12, 'Navigo', null)], changed_count: 1 })
})

test('previews the enabled rules and applies them to the rows they change', async () => {
  mocks.applyRules.mockResolvedValue({ updated_count: 1, transaction_ids: [11] })
  const onApplied = vi.fn()
  render(onApplied)

  expect(await screen.findByText('Payee → SFR')).toBeInTheDocument()
  expect(screen.getByText('Category → Phone')).toBeInTheDocument()
  expect(mocks.previewRules).toHaveBeenCalledWith([11, 12], [1])

  fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 transaction' }))
  await waitFor(() => expect(mocks.applyRules).toHaveBeenCalledWith([11], [1], 1))
  await waitFor(() => expect(onApplied).toHaveBeenCalled())
})

test('a disabled rule can be ticked to try it', async () => {
  render()
  await screen.findByText('Payee → SFR')
  fireEvent.click(screen.getByLabelText(/Trial/))
  await waitFor(() => expect(mocks.previewRules).toHaveBeenLastCalledWith([11, 12], [1, 2]))
})

test('says when there is no rule yet', async () => {
  mocks.fetchRules.mockResolvedValue([])
  const onOpenRules = vi.fn()
  renderWithProviders(
    <RulesApplyModal transactionIds={[11]} transactions={transactions} allUsers={[]} selectedUserId={1}
                     onClose={() => {}} onApplied={() => {}} onOpenRules={onOpenRules} />
  )
  fireEvent.click(await screen.findByText('Go to Rules'))
  expect(onOpenRules).toHaveBeenCalled()
})
