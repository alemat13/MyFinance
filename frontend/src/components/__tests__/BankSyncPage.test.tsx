import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import BankSyncPage from '../BankSyncPage'

const {
  mockFetchBankConnections,
  mockFetchBankInstitutions,
  mockFetchAccounts,
  mockCreateBankConnection,
  mockDeleteBankConnection,
  mockUpdateBankAccountLink,
  mockSyncBankAccountLink,
} = vi.hoisted(() => ({
  mockFetchBankConnections: vi.fn(),
  mockFetchBankInstitutions: vi.fn(),
  mockFetchAccounts: vi.fn(),
  mockCreateBankConnection: vi.fn(),
  mockDeleteBankConnection: vi.fn(),
  mockUpdateBankAccountLink: vi.fn(),
  mockSyncBankAccountLink: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchBankConnections: mockFetchBankConnections,
  fetchBankInstitutions: mockFetchBankInstitutions,
  fetchAccounts: mockFetchAccounts,
  createBankConnection: mockCreateBankConnection,
  deleteBankConnection: mockDeleteBankConnection,
  updateBankAccountLink: mockUpdateBankAccountLink,
  syncBankAccountLink: mockSyncBankAccountLink,
}))

const accounts = [
  { id: 1, name: 'Compte Courant', type: 'Checking', balance: 0, currency: 'EUR', created_at: '', archived: false, users: [], split_weights: [] },
  { id: 2, name: 'Vieux Compte', type: 'Checking', balance: 0, currency: 'EUR', created_at: '', archived: true, users: [], split_weights: [] },
]

const unlinkedLink = {
  id: 10,
  connection_id: 1,
  iban: 'FR7612345678901234567890123',
  remote_name: 'Compte Courant BoursoBank',
  currency: 'EUR',
  account_id: null,
  account_name: null,
  sync_enabled: true,
  sync_from_date: null,
  last_synced_at: null,
  last_sync_status: null,
  last_sync_error: null,
  last_imported_count: 0,
}

const linkedLink = {
  ...unlinkedLink,
  account_id: 1,
  account_name: 'Compte Courant',
  sync_from_date: '2026-09-19',
  last_synced_at: '2026-09-19T10:00:00Z',
  last_sync_status: 'success' as const,
  last_imported_count: 3,
}

function connection(overrides = {}) {
  return {
    id: 1,
    aspsp_name: 'BoursoBank',
    aspsp_country: 'FR',
    status: 'linked' as const,
    access_valid_until: '2026-12-18T00:00:00Z',
    created_at: '2026-09-19T09:00:00Z',
    last_error: null,
    accounts: [unlinkedLink],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.pushState(null, '', '/')
  mockFetchAccounts.mockResolvedValue(accounts)
  mockFetchBankInstitutions.mockResolvedValue([
    { name: 'BoursoBank', country: 'FR', logo: null },
    { name: 'CCF', country: 'FR', logo: null },
  ])
  mockFetchBankConnections.mockResolvedValue([])
})

afterEach(() => {
  window.history.pushState(null, '', '/')
})

test('shows an empty state when no bank is connected', async () => {
  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByText('No bank connected yet.')).toBeInTheDocument()
})

test('lists the available banks to connect', async () => {
  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByRole('option', { name: 'BoursoBank' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'CCF' })).toBeInTheDocument()
})

test('keeps showing connected banks when the institution list fails', async () => {
  mockFetchBankInstitutions.mockRejectedValue(new Error('not configured'))
  mockFetchBankConnections.mockResolvedValue([connection()])

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByText(/The bank list is unavailable/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'BoursoBank' })).toBeInTheDocument()
})

test('shows a connected bank with its accounts and consent expiry', async () => {
  mockFetchBankConnections.mockResolvedValue([connection()])

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByRole('heading', { name: 'BoursoBank' })).toBeInTheDocument()
  expect(screen.getByText('Compte Courant BoursoBank')).toBeInTheDocument()
  expect(screen.getByText('FR7612345678901234567890123')).toBeInTheDocument()
  expect(screen.getByText(/Access valid until/)).toBeInTheDocument()
})

test('warns when the consent is about to expire', async () => {
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString()
  mockFetchBankConnections.mockResolvedValue([connection({ access_valid_until: soon })])

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByText(/reconnect this bank to keep syncing/)).toBeInTheDocument()
})

test('offers only open accounts to map a bank account to', async () => {
  mockFetchBankConnections.mockResolvedValue([connection()])

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  const select = await screen.findByLabelText('Feeds MyFinance account')
  expect(within(select).getByRole('option', { name: 'Compte Courant' })).toBeInTheDocument()
  expect(within(select).queryByRole('option', { name: 'Vieux Compte' })).not.toBeInTheDocument()
})

test('saves the mapping when an account is picked', async () => {
  mockFetchBankConnections.mockResolvedValue([connection()])
  mockUpdateBankAccountLink.mockResolvedValue(linkedLink)

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  fireEvent.change(await screen.findByLabelText('Feeds MyFinance account'), { target: { value: '1' } })

  await waitFor(() => expect(mockUpdateBankAccountLink).toHaveBeenCalledWith(10, {
    account_id: 1,
    sync_enabled: true,
    sync_from_date: null,
  }))
})

test('cannot sync an account that is not mapped yet', async () => {
  mockFetchBankConnections.mockResolvedValue([connection()])

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByRole('button', { name: 'Sync now' })).toBeDisabled()
})

test('syncs a mapped account and reports what came in', async () => {
  mockFetchBankConnections.mockResolvedValue([connection({ accounts: [linkedLink] })])
  mockSyncBankAccountLink.mockResolvedValue({ ran: true, synced_links: 1, created_count: 4, status: 'success', error: null })

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))

  await waitFor(() => expect(mockSyncBankAccountLink).toHaveBeenCalledWith(10))
  expect(await screen.findByText('4 transaction(s) imported')).toBeInTheDocument()
})

test('surfaces a failed sync', async () => {
  mockFetchBankConnections.mockResolvedValue([connection({
    accounts: [{ ...linkedLink, last_sync_status: 'failed' as const, last_sync_error: 'bank is down' }],
  })])

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByText('bank is down')).toBeInTheDocument()
})

test('disconnecting asks for confirmation first', async () => {
  mockFetchBankConnections.mockResolvedValue([connection()])
  mockDeleteBankConnection.mockResolvedValue(undefined)

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
  expect(mockDeleteBankConnection).not.toHaveBeenCalled()

  fireEvent.click(await screen.findByRole('button', { name: 'Confirm disconnect' }))
  await waitFor(() => expect(mockDeleteBankConnection).toHaveBeenCalledWith(1))
})

test('reports a successful connection coming back from the bank', async () => {
  window.history.pushState(null, '', '/?bank=connected')
  mockFetchBankConnections.mockResolvedValue([connection()])

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByText('Bank connected')).toBeInTheDocument()
  expect(window.location.search).not.toContain('bank=connected')
})

test('reports an abandoned consent coming back from the bank', async () => {
  window.history.pushState(null, '', '/?bank=error')

  renderWithProviders(<BankSyncPage onBack={() => {}} />)

  expect(await screen.findByText('The bank connection was not completed')).toBeInTheDocument()
})
