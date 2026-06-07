import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, created_at: '2026-01-01', users: [] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows loading initially', () => {
  mockFetchAccounts.mockReturnValue(new Promise(() => {}))

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders accounts from API', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })
})

test('shows empty message when no accounts', async () => {
  mockFetchAccounts.mockResolvedValue([])

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  })
})

test('can open and submit new account form', async () => {
  mockFetchAccounts.mockResolvedValue([])
  mockCreateAccount.mockResolvedValue({ ...baseAccount, id: 2, name: 'New', type: 'Savings', balance: 50 })

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Account'))

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'New' } })
  fireEvent.change(screen.getByPlaceholderText('Type'), { target: { value: 'Savings' } })
  fireEvent.change(screen.getByPlaceholderText('Balance'), { target: { value: '50' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateAccount).toHaveBeenCalledWith({ name: 'New', type: 'Savings', balance: 50, users: [] })
  })
})

test('can edit an account inline', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockUpdateAccount.mockResolvedValue({ ...baseAccount, name: 'Updated' })

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

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

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  await waitFor(() => {
    expect(mockDeleteAccount).toHaveBeenCalledWith(1)
  })
})

test('cancels delete when confirm is false', async () => {
  vi.mocked(window.confirm).mockReturnValue(false)

  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockDeleteAccount.mockResolvedValue(undefined)

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  expect(mockDeleteAccount).not.toHaveBeenCalled()
})

test('shows error state on fetch failure', async () => {
  mockFetchAccounts.mockRejectedValue(new Error('Failed to load'))

  render(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
