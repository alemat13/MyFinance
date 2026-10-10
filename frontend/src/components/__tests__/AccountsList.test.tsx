import { describe, test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import AccountsList from '../AccountsList'
import { Account } from '../../api/client'

const { mockFetchAccounts, mockCreateAccount, mockUpdateAccount, mockDeleteAccount, mockFetchUsers, mockUpdateAccountSplitWeights } = vi.hoisted(() => ({
  mockFetchAccounts: vi.fn(),
  mockCreateAccount: vi.fn(),
  mockUpdateAccount: vi.fn(),
  mockDeleteAccount: vi.fn(),
  mockFetchUsers: vi.fn().mockResolvedValue([]),
  mockUpdateAccountSplitWeights: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchAccounts: mockFetchAccounts,
  createAccount: mockCreateAccount,
  updateAccount: mockUpdateAccount,
  deleteAccount: mockDeleteAccount,
  fetchUsers: mockFetchUsers,
  updateAccountSplitWeights: mockUpdateAccountSplitWeights,
}))

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 100, currency: 'EUR', created_at: '2026-01-01', archived: false, users: [], split_weights: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateAccountSplitWeights.mockResolvedValue([])
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

test('shows a clarifying toast (and keeps the form open) when account creation succeeds but split weights fail to save', async () => {
  mockFetchAccounts.mockResolvedValue([])
  mockCreateAccount.mockResolvedValue({ ...baseAccount, id: 2, name: 'New', type: 'Savings', balance: 50 })
  mockUpdateAccountSplitWeights.mockRejectedValue(new Error('boom'))

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Account'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'New' } })
  fireEvent.change(screen.getByPlaceholderText('Type'), { target: { value: 'Savings' } })
  fireEvent.click(screen.getByText('Save'))

  expect(await screen.findByText(/was created, but its split weights failed to save/)).toBeInTheDocument()
  // The form isn't silently reset, so the user doesn't retry and create a duplicate.
  expect(screen.getByDisplayValue('New')).toBeInTheDocument()
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

test('shows a clarifying toast when account edit succeeds but split weights fail to save', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockUpdateAccount.mockResolvedValue({ ...baseAccount, name: 'Updated' })
  mockUpdateAccountSplitWeights.mockRejectedValue(new Error('boom'))

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))
  const nameInput = screen.getAllByDisplayValue('Checking')[0]
  fireEvent.change(nameInput, { target: { value: 'Updated' } })
  fireEvent.click(screen.getByText('Save'))

  expect(await screen.findByText(/details were saved, but its split weights failed to save/)).toBeInTheDocument()
})

test('can add an account-level split weight row and save, independently of ownership', async () => {
  mockFetchUsers.mockResolvedValueOnce([{ id: 1, name: 'Alex', email: null, created_at: '' }])
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockUpdateAccount.mockResolvedValue(baseAccount)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))

  const addUserButtons = screen.getAllByRole('button', { name: 'Add user' })
  // Two SplitEditors are rendered while editing (Owners, then Split Weight) — use the second.
  fireEvent.click(addUserButtons[addUserButtons.length - 1])
  const weightInput = screen.getByDisplayValue('0')
  fireEvent.change(weightInput, { target: { value: '55' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateAccountSplitWeights).toHaveBeenCalledWith(1, [{ user_id: 1, weight: 55 }])
  })
  expect(mockUpdateAccount).toHaveBeenCalled()
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

test('can archive an account', async () => {
  mockFetchAccounts.mockResolvedValue([baseAccount])
  mockUpdateAccount.mockResolvedValue({ ...baseAccount, archived: true })

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Archive'))

  await waitFor(() => {
    expect(mockUpdateAccount).toHaveBeenCalledWith(1, { archived: true })
  })
})

test('hides archived accounts by default, and "Show archived" reveals them with an Unarchive action', async () => {
  const archivedAccount = { ...baseAccount, id: 2, name: 'Closed Account', archived: true }
  mockFetchAccounts.mockResolvedValue([baseAccount, archivedAccount])
  mockUpdateAccount.mockResolvedValue({ ...archivedAccount, archived: false })

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText(/\$?100/)).toBeInTheDocument()
  })
  expect(screen.queryByText('Closed Account')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('checkbox', { name: /show archived/i }))

  expect(await screen.findByText('Closed Account')).toBeInTheDocument()
  expect(screen.getByText('Archived')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Unarchive'))

  await waitFor(() => {
    expect(mockUpdateAccount).toHaveBeenCalledWith(2, { archived: false })
  })
})

test('shows error state on fetch failure', async () => {
  mockFetchAccounts.mockRejectedValue(new Error('Failed to load'))

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})

// --- Grouping and split weights ---

const acct = (id: number, name: string, type: string, extra: Partial<Account> = {}): Account =>
  ({ ...baseAccount, id, name, type, ...extra })

const grouped = [
  acct(1, 'Revolut', 'Checking'),
  acct(2, 'CC CCF Joint', 'Checking', {
    split_weights: [{ user_id: 1, user_name: 'Alex', weight: 3 }, { user_id: 2, user_name: 'Olivia', weight: 1 }],
  }),
  acct(3, 'PER', 'Investment'),
  acct(4, 'Vieux PEL', 'Savings', { archived: true }),
  acct(5, 'Ancien CC', 'Checking', { archived: true }),
]

const rowNames = () => screen.getAllByRole('row').map(r => r.textContent ?? '')

test('groups accounts under one header per type, alphabetically, names sorted inside', async () => {
  mockFetchAccounts.mockResolvedValue(grouped)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await screen.findByText('Revolut')
  const rows = rowNames()
  const at = (text: string) => rows.findIndex(r => r.startsWith(text))
  expect(at('Checking')).toBeLessThan(at('CC CCF Joint'))
  expect(at('CC CCF Joint')).toBeLessThan(at('Revolut'))
  expect(at('Revolut')).toBeLessThan(at('Investment'))
  expect(screen.queryByText('Vieux PEL')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Archived/ })).not.toBeInTheDocument()
})

test('a type header collapses and expands its accounts', async () => {
  mockFetchAccounts.mockResolvedValue(grouped)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await screen.findByText('Revolut')
  fireEvent.click(screen.getByRole('button', { name: /^Checking/ }))
  expect(screen.queryByText('Revolut')).not.toBeInTheDocument()
  expect(screen.getByText('PER')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Checking/ }))
  expect(screen.getByText('Revolut')).toBeInTheDocument()
})

test('archived accounts sit under one Archived header, by type then name', async () => {
  mockFetchAccounts.mockResolvedValue(grouped)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await screen.findByText('Revolut')
  fireEvent.click(screen.getByRole('checkbox', { name: /show archived/i }))

  expect(screen.getByRole('button', { name: /^Archived/ })).toHaveTextContent('Archived2')
  expect(screen.getAllByRole('separator').map(s => s.textContent)).toEqual(['Checking', 'Savings'])
  const rows = rowNames()
  expect(rows.findIndex(r => r.startsWith('Ancien CC'))).toBeLessThan(rows.findIndex(r => r.startsWith('Vieux PEL')))
})

test('shows each account\'s split weights with the resulting share, or Default when unset', async () => {
  mockFetchAccounts.mockResolvedValue(grouped)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  const row = (await screen.findByText('CC CCF Joint')).closest('tr')!
  expect(row).toHaveTextContent('Alex 3 · 75%')
  expect(row).toHaveTextContent('Olivia 1 · 25%')
  expect(screen.getByText('Revolut').closest('tr')).toHaveTextContent('Default')
})

test('on mobile, renders cards instead of a table, still grouped and showing split weights', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === '(max-width: 767px)', media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
  mockFetchAccounts.mockResolvedValue(grouped)

  renderWithProviders(<AccountsList onBack={() => {}} selectedUserId={null} />)

  await screen.findByText('Revolut')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  const cards = screen.getAllByTestId('account-card')
  expect(cards.map(c => within(c).getByText(/^(CC CCF Joint|Revolut|PER)$/).textContent)).toEqual(['CC CCF Joint', 'Revolut', 'PER'])
  expect(cards[0]).toHaveTextContent('Alex 3 · 75%')

  fireEvent.click(within(cards[1]).getByText('Edit'))
  expect(screen.getByLabelText('Name')).toHaveValue('Revolut')
  vi.restoreAllMocks()
})
