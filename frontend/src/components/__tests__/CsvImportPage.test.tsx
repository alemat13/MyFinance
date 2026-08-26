import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CsvImportPage from '../CsvImportPage'

const { mockFetchAccounts, mockFetchCategories, mockPreviewImport, mockCommitImport } = vi.hoisted(() => ({
  mockFetchAccounts: vi.fn(),
  mockFetchCategories: vi.fn(),
  mockPreviewImport: vi.fn(),
  mockCommitImport: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchAccounts: mockFetchAccounts,
  fetchCategories: mockFetchCategories,
  previewImport: mockPreviewImport,
  commitImport: mockCommitImport,
}))

const account = { id: 1, name: 'Checking', type: 'Checking', balance: 100, created_at: '', users: [] }
const category = { id: 1, name: 'Groceries', type: 'Expense', splits: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAccounts.mockResolvedValue([account])
  mockFetchCategories.mockResolvedValue([category])
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function goToSetup() {
  render(<CsvImportPage onBack={() => {}} />)
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/Paste CSV text/)).toBeInTheDocument()
  })
}

test('previews a CSV and shows row statuses', async () => {
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, category_id: 1, category_name: 'Groceries', status: 'ok', error_message: null, preview_split: [] },
    { row_number: 2, transaction_date: '2026-01-16', payee: 'Unknown', memo: null, amount: -10, account_id: 1, category_id: null, category_name: null, status: 'needs_category', error_message: null, preview_split: [] },
  ])

  await goToSetup()

  fireEvent.change(screen.getByPlaceholderText(/Paste CSV text/), { target: { value: 'Date,Label,Amount\n2026-01-15,Whole Foods,-42.50\n' } })
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } })
  fireEvent.change(screen.getByPlaceholderText('Date column name'), { target: { value: 'Date' } })
  fireEvent.change(screen.getByPlaceholderText('Payee column name'), { target: { value: 'Label' } })
  fireEvent.change(screen.getByPlaceholderText('Amount column name'), { target: { value: 'Amount' } })

  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => {
    expect(screen.getByText('Whole Foods')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('Needs category')).toBeInTheDocument()
  })
})

test('commit is disabled until all active rows have a category', async () => {
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-16', payee: 'Unknown', memo: null, amount: -10, account_id: 1, category_id: null, category_name: null, status: 'needs_category', error_message: null, preview_split: [] },
  ])

  await goToSetup()

  fireEvent.change(screen.getByPlaceholderText(/Paste CSV text/), { target: { value: 'Date,Label,Amount\n2026-01-16,Unknown,-10\n' } })
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } })
  fireEvent.change(screen.getByPlaceholderText('Date column name'), { target: { value: 'Date' } })
  fireEvent.change(screen.getByPlaceholderText('Payee column name'), { target: { value: 'Label' } })
  fireEvent.change(screen.getByPlaceholderText('Amount column name'), { target: { value: 'Amount' } })
  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => {
    expect(screen.getByText('Needs category')).toBeInTheDocument()
  })

  const commitButton = screen.getByText(/Commit/)
  expect(commitButton).toBeDisabled()

  const categorySelect = screen.getAllByRole('combobox').find(el => el.textContent?.includes('Groceries'))!
  fireEvent.change(categorySelect, { target: { value: '1' } })

  await waitFor(() => {
    expect(screen.getByText(/Commit/)).not.toBeDisabled()
  })
})

test('commits active rows and shows a success message with a way back', async () => {
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, category_id: 1, category_name: 'Groceries', status: 'ok', error_message: null, preview_split: [] },
  ])
  mockCommitImport.mockResolvedValue({ created_count: 1, transaction_ids: [5] })
  const onBack = vi.fn()

  render(<CsvImportPage onBack={onBack} />)
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/Paste CSV text/)).toBeInTheDocument()
  })

  fireEvent.change(screen.getByPlaceholderText(/Paste CSV text/), { target: { value: 'Date,Label,Amount\n2026-01-15,Whole Foods,-42.50\n' } })
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } })
  fireEvent.change(screen.getByPlaceholderText('Date column name'), { target: { value: 'Date' } })
  fireEvent.change(screen.getByPlaceholderText('Payee column name'), { target: { value: 'Label' } })
  fireEvent.change(screen.getByPlaceholderText('Amount column name'), { target: { value: 'Amount' } })
  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => {
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText(/Commit 1 transaction/))

  await waitFor(() => {
    expect(mockCommitImport).toHaveBeenCalledWith([
      { date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, category_id: 1 },
    ])
    expect(screen.getByText(/Imported 1 transaction/)).toBeInTheDocument()
  })
  expect(onBack).not.toHaveBeenCalled()

  fireEvent.click(screen.getByText('Back to Dashboard'))
  expect(onBack).toHaveBeenCalled()
})
