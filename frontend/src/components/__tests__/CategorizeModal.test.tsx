import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import CategorizeModal from '../CategorizeModal'

const { mockSuggestCategories, mockApplyCategorizerSuggestions } = vi.hoisted(() => ({
  mockSuggestCategories: vi.fn(),
  mockApplyCategorizerSuggestions: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  suggestCategories: mockSuggestCategories,
  applyCategorizerSuggestions: mockApplyCategorizerSuggestions,
}))

const transactions = [
  { id: 11, date: '2026-08-02', payee: 'CARTE 02/08 SUPERMARCHE', amount: -42.5, currency: 'EUR' },
  { id: 12, date: '2026-08-03', payee: 'Navigo', amount: -88.8, currency: 'EUR' },
] as never[]

const suggestion = (over: Record<string, unknown> = {}) => ({
  transaction_id: 11,
  date: '2026-08-02',
  payee: 'CARTE 02/08 SUPERMARCHE',
  raw_label: 'CARTE 02/08 SUPERMARCHE',
  amount: -42.5,
  current_category_id: null,
  current_category_name: null,
  suggested_category_id: 3,
  suggested_category_name: 'Courses',
  confidence: 0.93,
  high_confidence: true,
  suggested_payee: null,
  category_changed: true,
  payee_changed: false,
  ...over,
})

const response = (items: unknown[], over: Record<string, unknown> = {}) => ({
  model_id: 7,
  threshold: 0.8,
  items,
  category_changes: items.length,
  payee_changes: 0,
  high_confidence_changes: items.length,
  ...over,
})

function render(props: Partial<Parameters<typeof CategorizeModal>[0]> = {}) {
  return renderWithProviders(
    <CategorizeModal
      transactionIds={[11, 12]}
      transactions={transactions}
      selectedUserId={1}
      onClose={() => {}}
      onApplied={() => {}}
      onOpenCategorizer={() => {}}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyCategorizerSuggestions.mockResolvedValue({
    updated_count: 1, transaction_ids: [11], skipped_transaction_ids: [],
  })
})

test('shows what each row is filed under now and what the model proposes', async () => {
  mockSuggestCategories.mockResolvedValue(response([suggestion()]))
  render()

  expect(await screen.findByText('Courses')).toBeInTheDocument()
  expect(screen.getByText('No category')).toBeInTheDocument()
  expect(screen.getByText('93%')).toBeInTheDocument()
  expect(mockSuggestCategories).toHaveBeenCalledWith([11, 12])
})

test('applies only the ticked rows, and only what would change', async () => {
  mockSuggestCategories.mockResolvedValue(response([
    suggestion(),
    suggestion({
      transaction_id: 12, payee: 'Navigo', amount: -88.8,
      current_category_id: 5, current_category_name: 'Transport',
      suggested_category_id: 5, suggested_category_name: 'Transport',
      category_changed: false,
    }),
  ], { category_changes: 1 }))
  render()

  // The row the model agrees with starts unticked, so it is not sent at all.
  fireEvent.click(await screen.findByRole('button', { name: /Apply to 1 transaction/ }))

  await waitFor(() => expect(mockApplyCategorizerSuggestions).toHaveBeenCalledWith(
    [{ transaction_id: 11, category_id: 3 }], false, 1,
  ))
})

test('sends a remembered name alongside the category', async () => {
  mockSuggestCategories.mockResolvedValue(response([
    suggestion({ suggested_payee: 'Supermarché du coin', payee_changed: true }),
  ], { payee_changes: 1 }))
  render()

  expect(await screen.findByText('→ Supermarché du coin')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Apply to 1 transaction/ }))

  await waitFor(() => expect(mockApplyCategorizerSuggestions).toHaveBeenCalledWith(
    [{ transaction_id: 11, category_id: 3, payee: 'Supermarché du coin' }], false, 1,
  ))
})

test('can apply the categories without the renames', async () => {
  mockSuggestCategories.mockResolvedValue(response([
    suggestion({ suggested_payee: 'Supermarché du coin', payee_changed: true }),
  ], { payee_changes: 1 }))
  render()

  fireEvent.click(await screen.findByLabelText('Apply remembered names (1)'))
  fireEvent.click(screen.getByRole('button', { name: /Apply to 1 transaction/ }))

  await waitFor(() => expect(mockApplyCategorizerSuggestions).toHaveBeenCalledWith(
    [{ transaction_id: 11, category_id: 3 }], false, 1,
  ))
})

test('leaves a category somebody set alone unless asked to replace it', async () => {
  mockSuggestCategories.mockResolvedValue(response([
    suggestion({ current_category_id: 9, current_category_name: 'Loisirs' }),
  ]))
  render()

  fireEvent.click(await screen.findByRole('button', { name: /Apply to 1 transaction/ }))
  await waitFor(() => expect(mockApplyCategorizerSuggestions).toHaveBeenCalledWith(
    [{ transaction_id: 11, category_id: 3 }], false, 1,
  ))

  fireEvent.click(screen.getByLabelText('Replace categories that are already set'))
  fireEvent.click(screen.getByRole('button', { name: /Apply to 1 transaction/ }))
  await waitFor(() => expect(mockApplyCategorizerSuggestions).toHaveBeenLastCalledWith(
    [{ transaction_id: 11, category_id: 3 }], true, 1,
  ))
})

test('unticking a row drops it from the apply', async () => {
  mockSuggestCategories.mockResolvedValue(response([suggestion()]))
  render()

  fireEvent.click(await screen.findByLabelText('Include CARTE 02/08 SUPERMARCHE'))
  expect(screen.getByRole('button', { name: /Apply to 0 transactions/ })).toBeDisabled()
})

test('says how many rows kept their own category', async () => {
  mockSuggestCategories.mockResolvedValue(response([suggestion()]))
  mockApplyCategorizerSuggestions.mockResolvedValue({
    updated_count: 0, transaction_ids: [], skipped_transaction_ids: [11],
  })
  render()

  fireEvent.click(await screen.findByRole('button', { name: /Apply to 1 transaction/ }))
  expect(await screen.findByText(/1 left alone because they already had a category/))
    .toBeInTheDocument()
})

test('points at the training screen when no model is active', async () => {
  mockSuggestCategories.mockRejectedValue(new Error('No active model. Train one first, then activate it.'))
  const onOpenCategorizer = vi.fn()
  render({ onOpenCategorizer })

  fireEvent.click(await screen.findByRole('button', { name: 'Go to Auto-categorization' }))
  expect(onOpenCategorizer).toHaveBeenCalled()
})

test('reports any other failure without offering that way out', async () => {
  mockSuggestCategories.mockRejectedValue(new Error('Service unavailable'))
  render()

  expect(await screen.findByText('Service unavailable')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Go to Auto-categorization' })).not.toBeInTheDocument()
})

test('shows the before and after as cards below the mobile breakpoint', async () => {
  const originalMatchMedia = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia

  try {
    mockSuggestCategories.mockResolvedValue(response([
      suggestion({ current_category_id: 9, current_category_name: 'Loisirs' }),
    ]))
    render()

    // Six columns do not fit at 390px, and the suggestion is the one thing that
    // must not be the one pushed off the edge.
    expect(await screen.findByText('Courses')).toBeInTheDocument()
    expect(screen.getByText('Loisirs')).toBeInTheDocument()
    expect(screen.getByText('93%')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    // The ticks still drive the apply, card or row.
    fireEvent.click(screen.getByLabelText('Include CARTE 02/08 SUPERMARCHE'))
    expect(screen.getByRole('button', { name: /Apply to 0 transactions/ })).toBeDisabled()
  } finally {
    window.matchMedia = originalMatchMedia
  }
})
