import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import BackupPage from '../BackupPage'

const { mockExportDatabase, mockImportDatabase } = vi.hoisted(() => ({
  mockExportDatabase: vi.fn(),
  mockImportDatabase: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  exportDatabase: mockExportDatabase,
  importDatabase: mockImportDatabase,
}))

const { mockDownloadBlob } = vi.hoisted(() => ({
  mockDownloadBlob: vi.fn(),
}))

vi.mock('../../utils/download', () => ({
  downloadBlob: mockDownloadBlob,
}))

const summary = {
  mode: 'overwrite' as const,
  users: 2, accounts: 1, categories: 3,
  account_users: 1, category_splits: 0, global_split_weights: 0,
  transactions: 5, transaction_splits: 5, transaction_history: 5,
}

function selectFile(name = 'backup.zip') {
  const file = new File(['zip-bytes'], name, { type: 'application/zip' })
  fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } })
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('export downloads a backup blob', async () => {
  const blob = new Blob(['zip-bytes'], { type: 'application/zip' })
  mockExportDatabase.mockResolvedValue(blob)

  renderWithProviders(<BackupPage onBack={() => {}} />)
  fireEvent.click(screen.getByText('Export Backup'))

  await waitFor(() => {
    expect(mockDownloadBlob).toHaveBeenCalledWith(blob, expect.stringMatching(/^myfinance-backup-.*\.zip$/))
  })
})

test('shows an error toast when export fails', async () => {
  mockExportDatabase.mockRejectedValue(new Error('export exploded'))

  renderWithProviders(<BackupPage onBack={() => {}} />)
  fireEvent.click(screen.getByText('Export Backup'))

  await waitFor(() => {
    expect(screen.getByText('export exploded')).toBeInTheDocument()
  })
})

test('import button is disabled until a file is selected', () => {
  renderWithProviders(<BackupPage onBack={() => {}} />)
  expect(screen.getByText('Import Backup')).toBeDisabled()

  selectFile()
  expect(screen.getByText('Import Backup')).not.toBeDisabled()
})

test('confirming the overwrite dialog imports with mode=overwrite and shows a summary toast', async () => {
  mockImportDatabase.mockResolvedValue(summary)

  renderWithProviders(<BackupPage onBack={() => {}} />)
  const file = selectFile()
  fireEvent.click(screen.getByText('Import Backup'))

  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/permanently delete all current data/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByText('Import'))

  await waitFor(() => {
    expect(mockImportDatabase).toHaveBeenCalledWith(file, 'overwrite')
    expect(screen.getByText(/Imported 2 user\(s\)/)).toBeInTheDocument()
  })
})

test('switching to append mode imports with mode=append and warns about conflicts', async () => {
  mockImportDatabase.mockResolvedValue({ ...summary, mode: 'append' })

  renderWithProviders(<BackupPage onBack={() => {}} />)
  const file = selectFile()
  fireEvent.change(screen.getByLabelText('Import mode'), { target: { value: 'append' } })
  fireEvent.click(screen.getByText('Import Backup'))

  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/conflict error/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByText('Import'))

  await waitFor(() => {
    expect(mockImportDatabase).toHaveBeenCalledWith(file, 'append')
  })
})

test('canceling the confirm dialog does not import', async () => {
  renderWithProviders(<BackupPage onBack={() => {}} />)
  selectFile()
  fireEvent.click(screen.getByText('Import Backup'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Cancel'))

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  expect(mockImportDatabase).not.toHaveBeenCalled()
})

test('shows an error toast when import fails', async () => {
  mockImportDatabase.mockRejectedValue(new Error('conflict: 409'))

  renderWithProviders(<BackupPage onBack={() => {}} />)
  selectFile()
  fireEvent.click(screen.getByText('Import Backup'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Import'))

  await waitFor(() => {
    expect(screen.getByText('conflict: 409')).toBeInTheDocument()
  })
})
