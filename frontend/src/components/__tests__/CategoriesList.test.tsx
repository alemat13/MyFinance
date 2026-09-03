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
    expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Food', type: 'Expense', color: null, icon: null, parent_id: null, splits: [] })
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
      name: 'Mortgage', type: 'Expense', color: null, icon: null, parent_id: null,
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

const housing = { id: 1, name: 'Housing', type: 'Expense', color: null, icon: null, parent_id: null, parent_name: null, splits: [] }
const rent = { id: 2, name: 'Rent', type: 'Expense', color: null, icon: null, parent_id: 1, parent_name: 'Housing', splits: [] }

test('groups subcategories under their parent, collapsed by default', async () => {
  mockFetchCategories.mockResolvedValue([housing, rent])

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Housing')).toBeInTheDocument()
  })

  expect(screen.getByText('1 subcategories')).toBeInTheDocument()
  expect(screen.queryByText('Rent')).not.toBeInTheDocument()
})

test('expanding a parent reveals its subcategory and an add-subcategory action', async () => {
  mockFetchCategories.mockResolvedValue([housing, rent])

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Housing')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByTitle('Expand'))

  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(screen.getByText('+ Add subcategory')).toBeInTheDocument()
})

test('clicking + Add subcategory prefills the parent and locks the type', async () => {
  mockFetchCategories.mockResolvedValue([housing, rent])
  mockCreateCategory.mockResolvedValue({ id: 2, name: 'Utilities', type: 'Expense', parent_id: 1, splits: [] })

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Housing')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByTitle('Expand'))
  fireEvent.click(screen.getByText('+ Add subcategory'))

  const typeInput = screen.getByPlaceholderText('Type (Income / Expense / Transfer)')
  expect(typeInput).toHaveValue('Expense')
  expect(typeInput).toBeDisabled()

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Utilities' } })
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateCategory).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Utilities', type: 'Expense', parent_id: 1,
    }))
  })
})

test('editing a category with subcategories disables the parent selector and type field', async () => {
  mockFetchCategories.mockResolvedValue([housing, rent])

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Housing')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Edit'))

  expect(screen.getByText("Has subcategories — can't set a parent")).toBeInTheDocument()
  const typeInput = screen.getByDisplayValue('Expense')
  expect(typeInput).toBeDisabled()
})

test('shows a clarifying toast when deleting a category with subcategories is rejected', async () => {
  mockFetchCategories.mockResolvedValue([housing])
  mockDeleteCategory.mockRejectedValue(new Error('Cannot delete category with existing subcategories'))

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Housing')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByText('Delete'))

  expect(await screen.findByText('Cannot delete category with existing subcategories')).toBeInTheDocument()
})

test('shows error state on fetch failure', async () => {
  mockFetchCategories.mockRejectedValue(new Error('Failed to load'))

  renderWithProviders(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
