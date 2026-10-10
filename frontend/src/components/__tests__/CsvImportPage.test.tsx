import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CsvImportPage from '../CsvImportPage'
import { pickAccount } from '../../test-utils'
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
  column_mapping: { date: 'Date', payee: 'Label', amount: 'Amount', memo: null, category: null, account: null },
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
  fireEvent.change(screen.getByLabelText('CSV or QIF file'), { target: { files: [file] } })
  return file
}

async function goToSetup() {
  render(<CsvImportPage onBack={() => {}} selectedUserId={null} />)
  await waitFor(() => {
    expect(screen.getByLabelText('CSV or QIF file')).toBeInTheDocument()
  })
}

async function goToConfirm(detected = fullyDetected) {
  mockDetectImport.mockResolvedValue(detected)
  await goToSetup()
  selectFile()
  pickAccount(screen.getByRole('button', { name: 'Default account' }), 'Checking')
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

test('the setup step says which file types are accepted', async () => {
  await goToSetup()
  expect(screen.getByText('Accepted files: CSV (.csv) and QIF (.qif).')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Import' })).toBeInTheDocument()
})

test('a QIF file shows the QIF notice on the confirm step', async () => {
  await goToConfirm({ ...fullyDetected, file_format: 'qif' })
  expect(screen.getByText(/QIF file: its records are read as/)).toBeInTheDocument()
})

test('a CSV file shows no QIF notice', async () => {
  await goToConfirm()
  expect(screen.queryByText(/QIF file: its records are read as/)).not.toBeInTheDocument()
})

test('preview stays disabled until required columns are chosen when detection fails to map them', async () => {
  await goToConfirm({
    ...fullyDetected,
    column_mapping: { date: 'Date', payee: 'Label', amount: null, memo: null, category: null, account: null },
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
    { row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, account_name: null, account_matched: true, category_id: 1, category_name: 'Groceries', status: 'ok', error_message: null, preview_split: [] },
    { row_number: 2, transaction_date: '2026-01-16', payee: 'Unknown', memo: null, amount: -10, account_id: 1, account_name: null, account_matched: true, category_id: null, category_name: null, status: 'needs_category', error_message: null, preview_split: [] },
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
    account_col: null,
  })
})

test('detecting a file with an account column pre-fills the account column picker', async () => {
  await goToConfirm({
    ...fullyDetected,
    headers: ['Date', 'Label', 'Amount', 'Account'],
    column_mapping: { ...fullyDetected.column_mapping, account: 'Account' },
  })

  expect(screen.getByDisplayValue('Account')).toBeInTheDocument()
})

test('flags a row whose account name did not match, and lets the user override it before commit', async () => {
  const secondAccount = { id: 2, name: 'Savings', type: 'Savings', balance: 0, created_at: '', users: [] }
  mockFetchAccounts.mockResolvedValue([account, secondAccount])
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, account_name: 'Unknown Account', account_matched: false, category_id: 1, category_name: 'Groceries', status: 'ok', error_message: null, preview_split: [] },
  ])
  mockCommitImport.mockResolvedValue({ created_count: 1, transaction_ids: [5] })

  await goToConfirm()
  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => {
    expect(screen.getByText('Account not matched — using default')).toBeInTheDocument()
  })

  const commitButton = screen.getByText(/Commit 1 transaction/)
  expect(commitButton).not.toBeDisabled()

  pickAccount(screen.getByRole('button', { name: 'Checking' }), 'Savings')

  fireEvent.click(commitButton)

  await waitFor(() => {
    expect(mockCommitImport).toHaveBeenCalledWith(
      [expect.objectContaining({ account_id: 2 })],
      null,
    )
  })
})

test('commit is allowed for rows still flagged as needing a category, and imports them uncategorized', async () => {
  mockPreviewImport.mockResolvedValue([
    { row_number: 1, transaction_date: '2026-01-16', payee: 'Unknown', memo: null, amount: -10, account_id: 1, account_name: null, account_matched: true, category_id: null, category_name: null, status: 'needs_category', error_message: null, preview_split: [] },
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
    { row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5, account_id: 1, account_name: null, account_matched: true, category_id: 1, category_name: 'Groceries', status: 'ok', error_message: null, preview_split: [] },
  ])
  mockCommitImport.mockResolvedValue({ created_count: 1, transaction_ids: [5] })
  const onBack = vi.fn()

  mockDetectImport.mockResolvedValue(fullyDetected)
  render(<CsvImportPage onBack={onBack} selectedUserId={42} />)
  await waitFor(() => {
    expect(screen.getByLabelText('CSV or QIF file')).toBeInTheDocument()
  })
  selectFile()
  pickAccount(screen.getByRole('button', { name: 'Default account' }), 'Checking')
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

const SUGGESTION_ROWS = [
  {
    row_number: 1, transaction_date: '2026-01-15', payee: 'Whole Foods', memo: null, amount: -42.5,
    account_id: 1, account_name: null, account_matched: true,
    category_id: 2, category_name: 'Restaurants', status: 'ok', error_message: null, preview_split: [],
    suggested_category_id: 1, suggested_category_name: 'Groceries', suggested_confidence: 0.91,
  },
  {
    row_number: 2, transaction_date: '2026-01-16', payee: 'Unknown', memo: null, amount: -10,
    account_id: 1, account_name: null, account_matched: true,
    category_id: null, category_name: null, status: 'needs_category', error_message: null, preview_split: [],
    suggested_category_id: 1, suggested_category_name: 'Groceries', suggested_confidence: 0.62,
  },
]

async function goToReviewWithSuggestions(rows: unknown[] = SUGGESTION_ROWS) {
  mockPreviewImport.mockResolvedValue(rows)
  await goToConfirm()
  fireEvent.click(screen.getByText('Preview'))
  await waitFor(() => expect(screen.getByText('Suggested')).toBeInTheDocument())
}

test('the review step offers the model category next to the file category', async () => {
  await goToReviewWithSuggestions()

  expect(screen.getByText('91%')).toBeInTheDocument()
  expect(screen.getByText('62%')).toBeInTheDocument()
  // Offered, not applied: the row the file categorized still says Restaurants.
  expect(screen.getByRole('button', { name: 'Use where the file has none (1)' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Use for every row (2)' })).toBeInTheDocument()
})

test('using the suggestions only where the file has none leaves the others alone', async () => {
  mockCommitImport.mockResolvedValue({ created_count: 2, transaction_ids: [1, 2] })
  await goToReviewWithSuggestions()

  fireEvent.click(screen.getByRole('button', { name: 'Use where the file has none (1)' }))
  fireEvent.click(screen.getByText('Commit 2 transaction(s)'))

  await waitFor(() => expect(mockCommitImport).toHaveBeenCalled())
  expect(mockCommitImport.mock.calls[0][0].map((r: { category_id: number }) => r.category_id)).toEqual([2, 1])
})

test('using them everywhere replaces the file categories and says what each one was', async () => {
  mockCommitImport.mockResolvedValue({ created_count: 2, transaction_ids: [1, 2] })
  await goToReviewWithSuggestions()

  fireEvent.click(screen.getByRole('button', { name: 'Use for every row (2)' }))
  expect(screen.getByText('was Restaurants')).toBeInTheDocument()
  expect(screen.getByText('was no category')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Commit 2 transaction(s)'))
  await waitFor(() => expect(mockCommitImport).toHaveBeenCalled())
  expect(mockCommitImport.mock.calls[0][0].map((r: { category_id: number }) => r.category_id)).toEqual([1, 1])
})

test('the file categories can be put back', async () => {
  await goToReviewWithSuggestions()

  fireEvent.click(screen.getByRole('button', { name: 'Use for every row (2)' }))
  fireEvent.click(screen.getByRole('button', { name: "Back to the file's categories" }))
  expect(screen.queryByText('was Restaurants')).not.toBeInTheDocument()
})

test('no model means no suggestion column at all', async () => {
  mockPreviewImport.mockResolvedValue([{
    ...SUGGESTION_ROWS[0],
    suggested_category_id: null, suggested_category_name: null, suggested_confidence: null,
  }])
  await goToConfirm()
  fireEvent.click(screen.getByText('Preview'))

  await waitFor(() => expect(screen.getByText('Commit 1 transaction(s)')).toBeInTheDocument())
  expect(screen.queryByText('Suggested')).not.toBeInTheDocument()
})
