import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CsvImportPage from '../CsvImportPage'
import { ImportDetectResponse } from '../../api/client'

const { mockFetchAccounts, mockFetchCategories, mockDetectImport, mockPreviewImport, mockCommitImport } = vi.hoisted(() => ({
  mockFetchAccounts: vi.fn(),
  mockFetchCategories: vi.fn(),
  mockDetectImport: vi.fn(),
  mockPreviewImport: vi.fn(),
  mockCommitImport: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchAccounts: mockFetchAccounts,
  fetchCategories: mockFetchCategories,
  detectImport: mockDetectImport,
  previewImport: mockPreviewImport,
  commitImport: mockCommitImport,
}))

const account = { id: 1, name: 'Checking', type: 'Checking', balance: 100, created_at: '', users: [] }
const category = { id: 1, name: 'Groceries', type: 'Expense', splits: [] }

const fullyDetected: ImportDetectResponse = {
  headers: ['Date', 'Label', 'Amount'],
  encoding: 'utf-8-sig',
  delimiter: ',',
  date_format: '%Y-%m-%d',
  decimal_separator: '.',
  column_mapping: { date: 'Date', payee: 'Label', amount: 'Amount', memo: null, category: null },
  sample_rows: [{ Date: '2026-01-15', Label: 'Whole Foods', Amount: '-42.50' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAccounts.mockResolvedValue([account])
  mockFetchCategories.mockResolvedValue([category])
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function selectFile(name = 'transactions.csv') {
  const file = new File(['Date,Label,Amount\n2026-01-15,Whole Foods,-42.50\n'], name, { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } })
  return file
}

async function goToSetup() {
  render(<CsvImportPage onBack={() => {}} selectedUserId={null} />)
  await waitFor(() => {
    expect(screen.getByLabelText('CSV file')).toBeInTheDocument()
  })
}

async function goToConfirm(detected = fullyDetected) {
  mockDetectImport.mockResolvedValue(detected)
  await goToSetup()
  selectFile()
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } })
  fireEvent.click(screen.getByText('Analyze file'))
  await waitFor(() => {
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })
}

test('analyzing a file pre-fills the confirmation form from detected settings', async () => {
  await goToConfirm()

  expect(screen.getByDisplayValue('Date')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Label')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Amount')).toBeInTheDocument()
  expect(screen.getByText('Preview')).not.toBeDisabled()
})

test('preview stays disabled until required columns are chosen when detection fails to map them', async () => {
  await goToConfirm({
    ...fullyDetected,
    column_mapping: { date: 'Date', payee: 'Label', amount: null, memo: null, category: null },
  })

  expect(screen.getByText('Preview')).toBeDisabled()

  const amountSelect = screen.getAllByRole('combobox').find(el => (el as HTMLSelectElement).value === '')!
  fireEvent.change(amountSelect, { target: { value: 'Amount' } })

  await waitFor(() => {
    expect(screen.getByText('Preview')).not.toBeDisabled()
  })
})

test('previews a CSV and shows row statuses', async () => {
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, category_id: 1, category_name: 'Groceries', status: 'ok', error_message: null, preview_split: [] },
    { row_number: 2, transaction_date: '2026-01-16', payee: 'Unknown', memo: null, amount: -10, account_id: 1, category_id: null, category_name: null, status: 'needs_category', error_message: null, preview_split: [] },
  ])

  await goToConfirm()
  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => {
    expect(screen.getByText('Whole Foods')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('Needs category')).toBeInTheDocument()
  })

  expect(mockPreviewImport).toHaveBeenCalledWith(expect.any(File), {
    account_id: 1,
    encoding: 'utf-8-sig',
    delimiter: ',',
    date_format: '%Y-%m-%d',
    decimal_separator: '.',
    date_col: 'Date',
    payee_col: 'Label',
    amount_col: 'Amount',
    memo_col: null,
    category_col: null,
  })
})

test('commit is allowed for rows still flagged as needing a category, and imports them uncategorized', async () => {
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-16', payee: 'Unknown', memo: null, amount: -10, account_id: 1, category_id: null, category_name: null, status: 'needs_category', error_message: null, preview_split: [] },
  ])
  mockCommitImport.mockResolvedValue({ created_count: 1, transaction_ids: [5] })

  await goToConfirm()
  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => {
    expect(screen.getByText('Needs category')).toBeInTheDocument()
  })

  const commitButton = screen.getByText(/Commit/)
  expect(commitButton).not.toBeDisabled()

  fireEvent.click(commitButton)

  await waitFor(() => {
    expect(mockCommitImport).toHaveBeenCalledWith(
      [expect.objectContaining({ payee: 'Unknown', category_id: null })],
      null,
    )
  })
})

test('commits active rows and shows a success message with a way back', async () => {
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, category_id: 1, category_name: 'Groceries', status: 'ok', error_message: null, preview_split: [] },
  ])
  mockCommitImport.mockResolvedValue({ created_count: 1, transaction_ids: [5] })
  const onBack = vi.fn()

  mockDetectImport.mockResolvedValue(fullyDetected)
  render(<CsvImportPage onBack={onBack} selectedUserId={42} />)
  await waitFor(() => {
    expect(screen.getByLabelText('CSV file')).toBeInTheDocument()
  })
  selectFile()
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } })
  fireEvent.click(screen.getByText('Analyze file'))
  await waitFor(() => {
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })
  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => {
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText(/Commit 1 transaction/))

  await waitFor(() => {
    expect(mockCommitImport).toHaveBeenCalledWith([
      { date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, category_id: 1 },
    ], 42)
    expect(screen.getByText(/Imported 1 transaction/)).toBeInTheDocument()
  })
  expect(onBack).not.toHaveBeenCalled()

  fireEvent.click(screen.getByText('Back to Dashboard'))
  expect(onBack).toHaveBeenCalled()
})
