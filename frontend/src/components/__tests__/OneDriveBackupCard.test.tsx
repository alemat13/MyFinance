import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import OneDriveBackupCard from '../OneDriveBackupCard'

const {
  mockFetchOneDriveSettings,
  mockUpdateOneDriveSettings,
  mockDisconnectOneDrive,
  mockRunOneDriveBackupNow,
  mockGetOneDriveConnectUrl,
} = vi.hoisted(() => ({
  mockFetchOneDriveSettings: vi.fn(),
  mockUpdateOneDriveSettings: vi.fn(),
  mockDisconnectOneDrive: vi.fn(),
  mockRunOneDriveBackupNow: vi.fn(),
  mockGetOneDriveConnectUrl: vi.fn(() => 'http://localhost:8000/api/onedrive/auth/start'),
}))

vi.mock('../../api/client', () => ({
  fetchOneDriveSettings: mockFetchOneDriveSettings,
  updateOneDriveSettings: mockUpdateOneDriveSettings,
  disconnectOneDrive: mockDisconnectOneDrive,
  runOneDriveBackupNow: mockRunOneDriveBackupNow,
  getOneDriveConnectUrl: mockGetOneDriveConnectUrl,
}))

const notConnected = {
  connected: false,
  account_email: null,
  folder_path: null,
  frequency: 'daily' as const,
  retention_count: 30,
  last_backup_at: null,
  last_backup_status: null,
  last_backup_error: null,
}

const connected = {
  connected: true,
  account_email: 'user@example.com',
  folder_path: '/MyFinance Backups',
  frequency: 'weekly' as const,
  retention_count: 10,
  last_backup_at: '2026-01-15T10:00:00Z',
  last_backup_status: 'success' as const,
  last_backup_error: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  window.history.pushState(null, '', '/')
})

test('shows loading initially', () => {
  mockFetchOneDriveSettings.mockReturnValue(new Promise(() => {}))

  renderWithProviders(<OneDriveBackupCard />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('shows a connect button when not connected', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(notConnected)

  renderWithProviders(<OneDriveBackupCard />)

  expect(await screen.findByText('Connect OneDrive')).toBeInTheDocument()
})

test('renders connected state with account email and settings', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(connected)

  renderWithProviders(<OneDriveBackupCard />)

  expect(await screen.findByText('user@example.com')).toBeInTheDocument()
  expect(screen.getByDisplayValue('/MyFinance Backups')).toBeInTheDocument()
  expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  expect(screen.getByText(/Last backup:/)).toBeInTheDocument()
})

test('saves updated folder/frequency/retention', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(connected)
  mockUpdateOneDriveSettings.mockResolvedValue({ ...connected, folder_path: '/New Folder', retention_count: 15 })

  renderWithProviders(<OneDriveBackupCard />)
  await screen.findByDisplayValue('/MyFinance Backups')

  fireEvent.change(screen.getByDisplayValue('/MyFinance Backups'), { target: { value: '/New Folder' } })
  fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '15' } })
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateOneDriveSettings).toHaveBeenCalledWith({
      folder_path: '/New Folder',
      frequency: 'weekly',
      retention_count: 15,
    })
  })
})

test('rejects saving an empty folder path without calling the API', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(connected)

  renderWithProviders(<OneDriveBackupCard />)
  await screen.findByDisplayValue('/MyFinance Backups')

  fireEvent.change(screen.getByDisplayValue('/MyFinance Backups'), { target: { value: '   ' } })
  fireEvent.click(screen.getByText('Save'))

  expect(await screen.findByText('Folder path cannot be empty')).toBeInTheDocument()
  expect(mockUpdateOneDriveSettings).not.toHaveBeenCalled()
})

test('backup now shows a success toast and refreshes', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(connected)
  mockRunOneDriveBackupNow.mockResolvedValue({ ran: true, status: 'success', error: null })

  renderWithProviders(<OneDriveBackupCard />)
  await screen.findByText('user@example.com')

  fireEvent.click(screen.getByText('Backup Now'))

  await waitFor(() => {
    expect(screen.getByText('Backup uploaded to OneDrive')).toBeInTheDocument()
  })
  expect(mockFetchOneDriveSettings).toHaveBeenCalledTimes(2)
})

test('backup now shows the server error on failure', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(connected)
  mockRunOneDriveBackupNow.mockResolvedValue({ ran: true, status: 'failed', error: 'upload exploded' })

  renderWithProviders(<OneDriveBackupCard />)
  await screen.findByText('user@example.com')

  fireEvent.click(screen.getByText('Backup Now'))

  await waitFor(() => {
    expect(screen.getByText('upload exploded')).toBeInTheDocument()
  })
})

test('disconnect requires confirmation', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(connected)
  mockDisconnectOneDrive.mockResolvedValue(notConnected)

  renderWithProviders(<OneDriveBackupCard />)
  await screen.findByText('user@example.com')

  fireEvent.click(screen.getByText('Disconnect'))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/stops automatic backups/)).toBeInTheDocument()

  fireEvent.click(within(dialog).getByText('Disconnect'))

  await waitFor(() => {
    expect(mockDisconnectOneDrive).toHaveBeenCalled()
    expect(screen.getByText('Connect OneDrive')).toBeInTheDocument()
  })
})

test('canceling disconnect does not call the API', async () => {
  mockFetchOneDriveSettings.mockResolvedValue(connected)

  renderWithProviders(<OneDriveBackupCard />)
  await screen.findByText('user@example.com')

  fireEvent.click(screen.getByText('Disconnect'))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Cancel'))

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  expect(mockDisconnectOneDrive).not.toHaveBeenCalled()
})

test('shows error state on fetch failure', async () => {
  mockFetchOneDriveSettings.mockRejectedValue(new Error('Failed to load'))

  renderWithProviders(<OneDriveBackupCard />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})

test('shows a success toast and strips the query param after a successful OAuth redirect', async () => {
  window.history.pushState(null, '', '/?onedrive=connected')
  mockFetchOneDriveSettings.mockResolvedValue(connected)

  renderWithProviders(<OneDriveBackupCard />)

  await waitFor(() => {
    expect(screen.getByText('OneDrive connected')).toBeInTheDocument()
  })
  expect(window.location.search).toBe('')
})

test('shows an error toast after a failed OAuth redirect', async () => {
  window.history.pushState(null, '', '/?onedrive=error')
  mockFetchOneDriveSettings.mockResolvedValue(notConnected)

  renderWithProviders(<OneDriveBackupCard />)

  await waitFor(() => {
    expect(screen.getByText('Failed to connect to OneDrive')).toBeInTheDocument()
  })
  expect(window.location.search).toBe('')
})
