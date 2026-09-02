import { describe, test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import CategoriesList from '../CategoriesList'

const { mockFetchCategories, mockCreateCategory, mockUpdateCategory, mockDeleteCategory, mockFetchUsers } = vi.hoisted(() => ({
  mockFetchCategories: vi.fn(),
  mockCreateCategory: vi.fn(),
  mockUpdateCategory: vi.fn(),
  mockDeleteCategory: vi.fn(),
  mockFetchUsers: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../api/client', () => ({
  fetchCategories: mockFetchCategories,
  createCategory: mockCreateCategory,
  updateCategory: mockUpdateCategory,
  deleteCategory: mockDeleteCategory,
  fetchUsers: mockFetchUsers,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

test('shows loading initially', () => {
  mockFetchCategories.mockReturnValue(new Promise(() => {}))

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders categories from API', async () => {
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income', splits: [] }])

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })
})

test('shows empty message when no categories', async () => {
  mockFetchCategories.mockResolvedValue([])

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })
})

test('can open and submit new category form', async () => {
  mockFetchCategories.mockResolvedValue([])
  mockCreateCategory.mockResolvedValue({ id: 1, name: 'Food', type: 'Expense', splits: [] })

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Food' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Food', type: 'Expense', color: null, icon: null, splits: [] })
  })
})

test('can edit a category inline', async () => {
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income', splits: [] }])
  mockUpdateCategory.mockResolvedValue({ id: 1, name: 'Food', type: 'Expense', splits: [] })

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))

  const nameInput = screen.getByDisplayValue('Salary')
  fireEvent.change(nameInput, { target: { value: 'Food' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateCategory).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Food' }))
  })
})

test('can delete a category', async () => {
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income', splits: [] }])
  mockDeleteCategory.mockResolvedValue(undefined)

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Delete'))

  await waitFor(() => {
    expect(mockDeleteCategory).toHaveBeenCalledWith(1)
  })
})

test('cancels delete when cancel is clicked', async () => {
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income', splits: [] }])
  mockDeleteCategory.mockResolvedValue(undefined)

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Cancel'))

  expect(mockDeleteCategory).not.toHaveBeenCalled()
})

test('can add a default split weight row and submit', async () => {
  mockFetchUsers.mockResolvedValueOnce([{ id: 1, name: 'Alex', email: null, created_at: '' }, { id: 2, name: 'Olivia', email: null, created_at: '' }])
  mockFetchCategories.mockResolvedValue([])
  mockCreateCategory.mockResolvedValue({ id: 1, name: 'Mortgage', type: 'Expense', splits: [] })

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Mortgage' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByRole('button', { name: 'Add user' }))
  const weightInput = screen.getByDisplayValue('0')
  fireEvent.change(weightInput, { target: { value: '3' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateCategory).toHaveBeenCalledWith({
      name: 'Mortgage', type: 'Expense', color: null, icon: null,
      splits: [{ user_id: 1, weight: 3 }],
    })
  })
})

test('allows a default split weight that does not sum to any target', async () => {
  mockFetchUsers.mockResolvedValueOnce([{ id: 1, name: 'Alex', email: null, created_at: '' }, { id: 2, name: 'Olivia', email: null, created_at: '' }])
  mockFetchCategories.mockResolvedValue([])
  mockCreateCategory.mockResolvedValue({ id: 1, name: 'Mortgage', type: 'Expense', splits: [] })

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Mortgage' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByRole('button', { name: 'Add user' }))
  fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '30' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateCategory).toHaveBeenCalledWith(expect.objectContaining({
      splits: [{ user_id: 1, weight: 30 }],
    }))
  })
})

test('rejects a default split weight with all-zero weights', async () => {
  mockFetchUsers.mockResolvedValueOnce([{ id: 1, name: 'Alex', email: null, created_at: '' }])
  mockFetchCategories.mockResolvedValue([])

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Mortgage' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByRole('button', { name: 'Add user' }))
  fireEvent.click(screen.getByText('Save'))

  expect(mockCreateCategory).not.toHaveBeenCalled()
})

test('rejects a default split weight with a negative weight', async () => {
  mockFetchUsers.mockResolvedValueOnce([{ id: 1, name: 'Alex', email: null, created_at: '' }])
  mockFetchCategories.mockResolvedValue([])

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Mortgage' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByRole('button', { name: 'Add user' }))
  fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '-5' } })

  fireEvent.click(screen.getByText('Save'))

  expect(mockCreateCategory).not.toHaveBeenCalled()
})

test('shows error state on fetch failure', async () => {
  mockFetchCategories.mockRejectedValue(new Error('Failed to load'))

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
