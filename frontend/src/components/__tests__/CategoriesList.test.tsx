import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows loading initially', () => {
  mockFetchCategories.mockReturnValue(new Promise(() => {}))

  render(<CategoriesList onBack={() => {}} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders categories from API', async () => {
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income', splits: [] }])

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })
})

test('shows empty message when no categories', async () => {
  mockFetchCategories.mockResolvedValue([])

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })
})

test('can open and submit new category form', async () => {
  mockFetchCategories.mockResolvedValue([])
  mockCreateCategory.mockResolvedValue({ id: 1, name: 'Food', type: 'Expense', splits: [] })

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Food' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Food', type: 'Expense', splits: [] })
  })
})

test('can edit a category inline', async () => {
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income', splits: [] }])
  mockUpdateCategory.mockResolvedValue({ id: 1, name: 'Food', type: 'Expense', splits: [] })

  render(<CategoriesList onBack={() => {}} />)

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

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  await waitFor(() => {
    expect(mockDeleteCategory).toHaveBeenCalledWith(1)
  })
})

test('cancels delete when confirm is false', async () => {
  vi.mocked(window.confirm).mockReturnValue(false)

  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income', splits: [] }])
  mockDeleteCategory.mockResolvedValue(undefined)

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  expect(mockDeleteCategory).not.toHaveBeenCalled()
})

test('can add a default split row and submit', async () => {
  mockFetchUsers.mockResolvedValueOnce([{ id: 1, name: 'Alex', email: null, created_at: '' }, { id: 2, name: 'Olivia', email: null, created_at: '' }])
  mockFetchCategories.mockResolvedValue([])
  mockCreateCategory.mockResolvedValue({ id: 1, name: 'Mortgage', type: 'Expense', splits: [] })

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Mortgage' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByText('+ Add User'))
  const percentInput = screen.getByDisplayValue('0')
  fireEvent.change(percentInput, { target: { value: '100' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateCategory).toHaveBeenCalledWith({
      name: 'Mortgage', type: 'Expense',
      splits: [{ user_id: 1, split_percentage: 100 }],
    })
  })
})

test('rejects a default split that does not sum to 100', async () => {
  mockFetchUsers.mockResolvedValueOnce([{ id: 1, name: 'Alex', email: null, created_at: '' }])
  mockFetchCategories.mockResolvedValue([])

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))
  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Mortgage' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByText('+ Add User'))
  fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '50' } })

  fireEvent.click(screen.getByText('Save'))

  expect(mockCreateCategory).not.toHaveBeenCalled()
})

test('shows error state on fetch failure', async () => {
  mockFetchCategories.mockRejectedValue(new Error('Failed to load'))

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
