import { describe, test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import AccountsList from '../AccountsList'

const { mockFetchAccounts, mockCreateAccount, mockUpdateAccount, mockDeleteAccount, mockFetchUsers } = vi.hoisted(() => ({
  mockFetchAccounts: vi.fn(),
  mockCreateAccount: vi.fn(),
  mockUpdateAccount: vi.fn(),
  mockDeleteAccount: vi.fn(),
  mockFetchUsers: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/client', () => ({
  fetchAccounts: mockFetchAccounts,
  createAccount: mockCreateAccount,
  updateAccount: mockUpdateAccount,
  deleteAccount: mockDeleteAccount,
  fetchUsers: mockFetchUsers,
}))

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, currency: 'EUR', created_at: '2026-01-01', users: [] }

beforeEach(() => {
  vi.clearAllMocks()
})

test('shows loading initially', () => {
  mockFetchAccounts.mockReturnValue(new Promise(() => {}))

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders accounts from API', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })
})

test('shows empty message when no accounts', async () => {
  mockFetchAccounts.mockResolvedValue([])

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  })
})

test('can open and submit new account form', async () => {
  mockFetchAccounts.mockResolvedValue([])
  mockCreateAccount.mockResolvedValue({ ...baseAccount, id: 2, name: 'New', type: 'Savings', balance: 50 })

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Account'))

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'New' } })
  fireEvent.change(screen.getByPlaceholderText('Type'), { target: { value: 'Savings' } })
  fireEvent.change(screen.getByPlaceholderText('Balance'), { target: { value: '50' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateAccount).toHaveBeenCalledWith({ name: 'New', type: 'Savings', balance: 50, currency: 'EUR', users: [] })
  })
})

test('can edit an account inline', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockUpdateAccount.mockResolvedValue({ ...baseAccount, name: 'Updated' })

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))

  const nameInput = screen.getAllByDisplayValue('Checking')[0]
  fireEvent.change(nameInput, { target: { value: 'Updated' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateAccount).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Updated' }))
  })
})

test('can delete an account', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockDeleteAccount.mockResolvedValue(undefined)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Delete'))

  await waitFor(() => {
    expect(mockDeleteAccount).toHaveBeenCalledWith(1)
  })
})

test('cancels delete when cancel is clicked', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockDeleteAccount.mockResolvedValue(undefined)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Cancel'))

  expect(mockDeleteAccount).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('shows error state on fetch failure', async () => {
  mockFetchAccounts.mockRejectedValue(new Error('Failed to load'))

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
