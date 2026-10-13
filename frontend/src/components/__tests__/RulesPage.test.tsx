import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import RulesPage from '../RulesPage'

const mocks = vi.hoisted(() => ({
  fetchRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  reorderRules: vi.fn(),
  fetchAccounts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchUsers: vi.fn(),
  fetchSplitWeights: vi.fn(),
  searchTransactions: vi.fn(),
}))

vi.mock('../../api/client', () => mocks)

const rule = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'SFR', position: 0, enabled: true, match_mode: 'all',
  conditions: [{ field: 'raw_label', operator: 'contains', value: 'sfr' }],
  actions: { payee: 'SFR', category_id: 3 },
  created_at: '', updated_at: '',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchRules.mockResolvedValue([rule(), rule({ id: 2, name: 'Rent', position: 1, enabled: false,
    conditions: [{ field: 'payee', operator: 'equals', value: 'loyer' }], actions: { reconciled: true } })])
  mocks.fetchAccounts.mockResolvedValue([])
  mocks.fetchCategories.mockResolvedValue([{ id: 3, name: 'Phone', type: 'Expense', parent_id: null, splits: [] }])
  mocks.fetchUsers.mockResolvedValue([{ id: 1, name: 'Alex' }])
  mocks.fetchSplitWeights.mockResolvedValue([])
  mocks.searchTransactions.mockResolvedValue({ items: [], total: 12, page: 1, page_size: 1 })
})

test('lists the rules in order with what they match and do', async () => {
  renderWithProviders(<RulesPage onBack={() => {}} />)
  expect(await screen.findByText('Original label contains "sfr"')).toBeInTheDocument()
  expect(screen.getByText('Rename payee to "SFR", File under Phone')).toBeInTheDocument()
  expect(screen.getByText('Mark reconciled')).toBeInTheDocument()
  expect(screen.getByText('Off')).toBeInTheDocument()
})

test('moving a rule down saves the new order', async () => {
  mocks.reorderRules.mockResolvedValue([])
  renderWithProviders(<RulesPage onBack={() => {}} />)
  fireEvent.click(await screen.findByLabelText('Move SFR down'))
  expect(mocks.reorderRules).toHaveBeenCalledWith([2, 1])
})

test('creates a rule from conditions and actions, counting what it matches today', async () => {
  mocks.createRule.mockResolvedValue(rule({ id: 3 }))
  renderWithProviders(<RulesPage onBack={() => {}} />)
  fireEvent.click(await screen.findByText('+ New rule'))

  fireEvent.change(screen.getByPlaceholderText('e.g. SFR phone bill'), { target: { value: 'Netflix' } })
  const save = screen.getByRole('button', { name: 'Save rule' })
  expect(save).toBeDisabled()

  // The new rule opens on an "Original label contains" condition.
  const valueInputs = screen.getAllByRole('textbox')
  fireEvent.change(valueInputs[valueInputs.length - 1], { target: { value: 'netflix' } })
  await waitFor(() => expect(screen.getByText('12 existing transactions match today.')).toBeInTheDocument())

  fireEvent.click(screen.getByLabelText('Rename payee'))
  fireEvent.change(screen.getByLabelText('New payee'), { target: { value: 'Netflix' } })
  fireEvent.click(save)

  await waitFor(() => expect(mocks.createRule).toHaveBeenCalledWith({
    name: 'Netflix',
    enabled: true,
    match_mode: 'all',
    conditions: [{ field: 'raw_label', operator: 'contains', value: 'netflix', value2: undefined }],
    actions: { payee: 'Netflix' },
  }))
})

test('the on switch saves the rule enabled or not', async () => {
  mocks.updateRule.mockResolvedValue(rule())
  renderWithProviders(<RulesPage onBack={() => {}} />)
  fireEvent.click(await screen.findByLabelText('Enable SFR'))
  await waitFor(() => expect(mocks.updateRule).toHaveBeenCalledWith(1, expect.objectContaining({ enabled: false })))
})

test('a split action saves the global tier by name, not its current weights', async () => {
  mocks.createRule.mockResolvedValue(rule({ id: 3 }))
  renderWithProviders(<RulesPage onBack={() => {}} />)
  fireEvent.click(await screen.findByText('+ New rule'))
  fireEvent.change(screen.getByPlaceholderText('e.g. SFR phone bill'), { target: { value: 'Rent' } })
  const valueInputs = screen.getAllByRole('textbox')
  fireEvent.change(valueInputs[valueInputs.length - 1], { target: { value: 'loyer' } })

  fireEvent.click(screen.getByLabelText('Set split'))
  expect(screen.getByLabelText('Split to apply')).toHaveValue('global')
  fireEvent.click(screen.getByRole('button', { name: 'Save rule' }))

  await waitFor(() => expect(mocks.createRule).toHaveBeenCalledWith(
    expect.objectContaining({ actions: { split_tier: 'global' } })))
})

test('a saved tier is listed as read when the rule runs', async () => {
  mocks.fetchRules.mockResolvedValue([rule({ actions: { split_tier: 'default' } })])
  renderWithProviders(<RulesPage onBack={() => {}} />)
  expect(await screen.findByText(
    'Split: Default split (account, else category, else global), as set when the rule runs')).toBeInTheDocument()
})
