import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import UsersList from '../UsersList'

const { mockFetchUsers, mockCreateUser, mockUpdateUser, mockDeleteUser } = vi.hoisted(() => ({
  mockFetchUsers: vi.fn(),
  mockCreateUser: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockDeleteUser: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchUsers: mockFetchUsers,
  createUser: mockCreateUser,
  updateUser: mockUpdateUser,
  deleteUser: mockDeleteUser,
}))

const baseUser = { id: 1, name: 'Alex', email: 'alex@example.com', created_at: '2026-01-01' }

beforeEach(() => {
  vi.clearAllMocks()
})

test('shows loading initially', () => {
  mockFetchUsers.mockReturnValue(new Promise(() => {}))

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders users from API', async () => {
  mockFetchUsers.mockResolvedValue([baseUser])

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })
  expect(screen.getByText('alex@example.com')).toBeInTheDocument()
})

test('shows empty message when no users', async () => {
  mockFetchUsers.mockResolvedValue([])

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No users yet')).toBeInTheDocument()
  })
})

test('can open and submit new user form', async () => {
  mockFetchUsers.mockResolvedValue([])
  mockCreateUser.mockResolvedValue({ ...baseUser, id: 2, name: 'New', email: 'new@example.com' })

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No users yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New User'))

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'New' } })
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'new@example.com' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateUser).toHaveBeenCalledWith({ name: 'New', email: 'new@example.com' })
  })
})

test('rejects a new user with no name, without calling the API', async () => {
  mockFetchUsers.mockResolvedValue([])

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No users yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New User'))
  fireEvent.click(screen.getByText('Save'))

  expect(await screen.findByText('Name is required')).toBeInTheDocument()
  expect(mockCreateUser).not.toHaveBeenCalled()
})

test('cancelling the new user form clears it and hides it', async () => {
  mockFetchUsers.mockResolvedValue([])

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No users yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New User'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Discard me' } })
  fireEvent.click(screen.getByText('Cancel'))

  expect(screen.queryByPlaceholderText('Name')).not.toBeInTheDocument()

  fireEvent.click(screen.getByText('+ New User'))
  expect(screen.getByPlaceholderText('Name')).toHaveValue('')
})

test('can edit a user inline', async () => {
  mockFetchUsers.mockResolvedValue([baseUser])
  mockUpdateUser.mockResolvedValue({ ...baseUser, name: 'Updated' })

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))

  const nameInput = screen.getByDisplayValue('Alex')
  fireEvent.change(nameInput, { target: { value: 'Updated' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateUser).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Updated' }))
  })
})

test('cancelling an inline edit discards changes', async () => {
  mockFetchUsers.mockResolvedValue([baseUser])

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))
  fireEvent.change(screen.getByDisplayValue('Alex'), { target: { value: 'Changed' } })
  fireEvent.click(screen.getByText('Cancel'))

  expect(screen.getByText('Alex')).toBeInTheDocument()
  expect(mockUpdateUser).not.toHaveBeenCalled()
})

test('can delete a user', async () => {
  mockFetchUsers.mockResolvedValue([baseUser])
  mockDeleteUser.mockResolvedValue(undefined)

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Delete'))

  await waitFor(() => {
    expect(mockDeleteUser).toHaveBeenCalledWith(1)
  })
})

test('cancels delete when cancel is clicked', async () => {
  mockFetchUsers.mockResolvedValue([baseUser])
  mockDeleteUser.mockResolvedValue(undefined)

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Cancel'))

  expect(mockDeleteUser).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('clicking a user name filters by that user', async () => {
  mockFetchUsers.mockResolvedValue([baseUser])
  const onSelectUser = vi.fn()

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={onSelectUser} />)

  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Alex'))

  expect(onSelectUser).toHaveBeenCalledWith(1)
})

test('shows error state on fetch failure', async () => {
  mockFetchUsers.mockRejectedValue(new Error('Failed to load'))

  renderWithProviders(<UsersList onBack={() => {}} onSelectUser={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
