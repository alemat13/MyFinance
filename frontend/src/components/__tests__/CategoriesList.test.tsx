import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CategoriesList from '../CategoriesList'

const { mockFetchCategories, mockCreateCategory, mockUpdateCategory, mockDeleteCategory } = vi.hoisted(() => ({
  mockFetchCategories: vi.fn(),
  mockCreateCategory: vi.fn(),
  mockUpdateCategory: vi.fn(),
  mockDeleteCategory: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchCategories: mockFetchCategories,
  createCategory: mockCreateCategory,
  updateCategory: mockUpdateCategory,
  deleteCategory: mockDeleteCategory,
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
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income' }])

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
  mockCreateCategory.mockResolvedValue({ id: 1, name: 'Food', type: 'Expense' })

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No categories yet')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('+ New Category'))

  fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Food' } })
  fireEvent.change(screen.getByPlaceholderText('Type (Income / Expense / Transfer)'), { target: { value: 'Expense' } })

  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Food', type: 'Expense' })
  })
})

test('can edit a category inline', async () => {
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income' }])
  mockUpdateCategory.mockResolvedValue({ id: 1, name: 'Food', type: 'Expense' })

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
  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income' }])
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

  mockFetchCategories.mockResolvedValue([{ id: 1, name: 'Salary', type: 'Income' }])
  mockDeleteCategory.mockResolvedValue(undefined)

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('Delete'))

  expect(mockDeleteCategory).not.toHaveBeenCalled()
})

test('shows error state on fetch failure', async () => {
  mockFetchCategories.mockRejectedValue(new Error('Failed to load'))

  render(<CategoriesList onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
