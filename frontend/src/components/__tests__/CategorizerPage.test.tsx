import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import CategorizerPage from '../CategorizerPage'

const {
  mockFetchAccounts,
  mockFetchCategories,
  mockFetchCategorizerModels,
  mockTrainCategorizerModel,
  mockActivateCategorizerModel,
  mockDeleteCategorizerModel,
  mockSearchTransactions,
} = vi.hoisted(() => ({
  mockFetchAccounts: vi.fn(),
  mockFetchCategories: vi.fn(),
  mockFetchCategorizerModels: vi.fn(),
  mockTrainCategorizerModel: vi.fn(),
  mockActivateCategorizerModel: vi.fn(),
  mockDeleteCategorizerModel: vi.fn(),
  mockSearchTransactions: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchAccounts: mockFetchAccounts,
  fetchCategories: mockFetchCategories,
  fetchCategorizerModels: mockFetchCategorizerModels,
  trainCategorizerModel: mockTrainCategorizerModel,
  activateCategorizerModel: mockActivateCategorizerModel,
  deleteCategorizerModel: mockDeleteCategorizerModel,
  searchTransactions: mockSearchTransactions,
}))

const accounts = [
  { id: 1, name: 'CC CCF Joint', type: 'Checking', balance: 0, currency: 'EUR', created_at: '', archived: false, users: [], split_weights: [] },
  { id: 2, name: 'CC Olivia', type: 'Checking', balance: 0, currency: 'EUR', created_at: '', archived: false, users: [], split_weights: [] },
]

const categories = [
  { id: 1, name: 'Courses', type: 'Expense', parent_id: null, color: null, icon: null, created_at: '', split_weights: [] },
]

const readyMetrics = {
  tested_rows: 2202,
  accuracy: 0.74,
  parent_accuracy: 0.815,
  top3_accuracy: 0.855,
  thresholds: [
    { threshold: 0.8, coverage: 0.618, accuracy: 0.944, parent_accuracy: 0.968 },
  ],
  baseline: { coverage: 0.583, accuracy_on_covered: 0.87, accuracy: 0.544 },
  payee: { tested_rows: 2202, merchants: 412, coverage: 0.237, precision: 0.91, would_change: 180 },
}

const activeModel = {
  id: 7,
  created_at: '2026-10-09T10:00:00',
  status: 'ready',
  is_active: true,
  trained_rows: 19933,
  tested_rows: 2202,
  note: 'sans les comptes d\'Olivia',
  params: null,
  metrics: readyMetrics,
  error: null,
}

const inactiveModel = { ...activeModel, id: 8, is_active: false, note: null, created_at: '2026-10-08T10:00:00' }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAccounts.mockResolvedValue(accounts)
  mockFetchCategories.mockResolvedValue(categories)
  mockFetchCategorizerModels.mockResolvedValue([])
  mockSearchTransactions.mockResolvedValue({ items: [], total: 30088, page: 1, page_size: 1, total_pages: 1 })
})

test('says no model is active when none has been trained', async () => {
  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  expect(await screen.findByText(/No model is active yet/)).toBeInTheDocument()
  expect(screen.getByText('No model trained yet.')).toBeInTheDocument()
})

test('opens on a training and a test selection that do not overlap', async () => {
  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await screen.findByText(/No model is active yet/)

  // Two date conditions, one "before" the cutoff and one "between" it and today.
  const operators = screen.getAllByRole('combobox').filter(el =>
    within(el as HTMLElement).queryByText('before') || within(el as HTMLElement).queryByText('between'))
  const values = operators.map(el => (el as HTMLSelectElement).value)
  expect(values).toContain('before')
  expect(values).toContain('between')
})

test('counts the transactions each selection matches', async () => {
  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await waitFor(() => expect(screen.getAllByText(/30,088 transactions selected/).length).toBe(2))
})

test('trains with both selections and the payee settings, then shows the score', async () => {
  const trained = { ...inactiveModel, id: 9, created_at: '2026-10-09T20:00:00' }
  mockTrainCategorizerModel.mockResolvedValue(trained)
  mockFetchCategorizerModels.mockResolvedValueOnce([]).mockResolvedValue([trained])

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await screen.findByText(/No model is active yet/)

  fireEvent.change(screen.getByPlaceholderText(/What is different about this run/), { target: { value: 'first try' } })
  fireEvent.click(screen.getByRole('button', { name: 'Train a model' }))

  await waitFor(() => expect(mockTrainCategorizerModel).toHaveBeenCalledTimes(1))
  const body = mockTrainCategorizerModel.mock.calls[0][0]
  expect(body.train.conditions[0]).toMatchObject({ field: 'date', operator: 'before' })
  expect(body.test.conditions[0]).toMatchObject({ field: 'date', operator: 'between' })
  expect(body.note).toBe('first try')
  expect(body.payee_min_occurrences).toBe(2)
  expect(body.payee_min_stability).toBe(0.9)

  // Scoped to the score panel, since the models table repeats the accuracy.
  const score = within(await screen.findByRole('region', { name: 'Model score' }))
  expect(score.getByText('74.0%')).toBeInTheDocument()
  expect(score.getByText('54.4%')).toBeInTheDocument()
  expect(score.getByText('94.4%')).toBeInTheDocument()
  expect(score.getByText(/proposes/)).toHaveTextContent('23.7%')
  expect(score.getByText(/proposes/)).toHaveTextContent('91.0%')
})

test('a model lands inactive and is activated in a separate step', async () => {
  const trained = { ...inactiveModel, id: 9 }
  mockTrainCategorizerModel.mockResolvedValue(trained)
  mockFetchCategorizerModels.mockResolvedValueOnce([]).mockResolvedValue([trained])
  mockActivateCategorizerModel.mockResolvedValue({ ...trained, is_active: true })

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await screen.findByText(/No model is active yet/)
  fireEvent.click(screen.getByRole('button', { name: 'Train a model' }))

  const useButton = await screen.findByRole('button', { name: 'Use this model' })
  fireEvent.click(useButton)
  await waitFor(() => expect(mockActivateCategorizerModel).toHaveBeenCalledWith(9))
})

test('reports the error when training is refused', async () => {
  mockTrainCategorizerModel.mockRejectedValue(new Error('The training and test selections overlap on 12 transaction(s).'))

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await screen.findByText(/No model is active yet/)
  fireEvent.click(screen.getByRole('button', { name: 'Train a model' }))

  expect(await screen.findByText(/selections overlap on 12/)).toBeInTheDocument()
})

test('shows the active model and does not offer to delete it', async () => {
  mockFetchCategorizerModels.mockResolvedValue([activeModel, inactiveModel])

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  expect(await screen.findByText(/Active model:/)).toBeInTheDocument()
  expect(screen.getByText('Active')).toBeInTheDocument()
  // One Delete button only: the inactive model's.
  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
})

test('deletes a model after confirmation', async () => {
  mockFetchCategorizerModels.mockResolvedValue([activeModel, inactiveModel])
  mockDeleteCategorizerModel.mockResolvedValue(undefined)

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await screen.findByText(/Active model:/)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm delete' }))

  await waitFor(() => expect(mockDeleteCategorizerModel).toHaveBeenCalledWith(8))
})

test('shows why a failed model has no score', async () => {
  const failed = {
    ...inactiveModel, id: 11, status: 'failed', metrics: null,
    error: 'ValueError: no trainable rows',
  }
  mockFetchCategorizerModels.mockResolvedValue([failed])

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  expect(await screen.findByText(/Training failed: ValueError: no trainable rows/)).toBeInTheDocument()
  expect(screen.getByText('Failed')).toBeInTheDocument()
})

test('says so when no merchant was named consistently enough', async () => {
  const noPayees = {
    ...inactiveModel, id: 12,
    metrics: { ...readyMetrics, payee: { tested_rows: 10, merchants: 0 } },
  }
  mockFetchCategorizerModels.mockResolvedValue([noPayees])

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  expect(await screen.findByText(/No merchant was named consistently enough/)).toBeInTheDocument()
})

test('selections carry no user_id, since one model serves the whole household', async () => {
  mockTrainCategorizerModel.mockResolvedValue(inactiveModel)

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await screen.findByText(/No model is active yet/)
  fireEvent.click(screen.getByRole('button', { name: 'Train a model' }))

  await waitFor(() => expect(mockTrainCategorizerModel).toHaveBeenCalled())
  const body = mockTrainCategorizerModel.mock.calls[0][0]
  expect(body.train.user_id).toBeUndefined()
  expect(body.test.user_id).toBeUndefined()
})

test('a count that failed does not keep reading as one still loading', async () => {
  mockSearchTransactions.mockRejectedValue(new Error('boom'))

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  await waitFor(() => expect(screen.getAllByText(/Could not count this selection/).length).toBe(2))
  expect(screen.queryByText(/Counting…/)).not.toBeInTheDocument()
})

test('a run still in flight says so instead of claiming it could not be scored', async () => {
  mockFetchCategorizerModels.mockResolvedValue([
    { ...inactiveModel, id: 13, status: 'training', metrics: null },
  ])

  renderWithProviders(<CategorizerPage onBack={() => {}} />)
  expect(await screen.findByText(/Still training/)).toBeInTheDocument()
  expect(screen.getByText('Training…')).toBeInTheDocument()
})
