import { test, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import CategoryPicker from '../CategoryPicker'
import { Category } from '../../api/client'

const housing: Category = { id: 1, name: 'Housing', type: 'Expense', color: '#b91c1c', icon: 'Home', parent_id: null, splits: [] }
const rent: Category = { id: 2, name: 'Rent', type: 'Expense', parent_id: 1, splits: [] }
const insurance: Category = { id: 3, name: 'Home Insurance', type: 'Expense', parent_id: 1, splits: [] }
const salary: Category = { id: 4, name: 'Salary', type: 'Income', parent_id: null, splits: [] }

const categories = [housing, rent, insurance, salary]

test('shows Uncategorized when value is null', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={() => {}} />)
  expect(screen.getByText('Uncategorized')).toBeInTheDocument()
})

test('shows the selected category name in the trigger', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={2} onChange={() => {}} />)
  expect(screen.getByText('Rent')).toBeInTheDocument()
})

test('opening the popover lists top-level categories, collapsed by default', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={() => {}} />)
  fireEvent.click(screen.getByText('Uncategorized'))

  expect(screen.getByText('Housing')).toBeInTheDocument()
  expect(screen.getByText('Salary')).toBeInTheDocument()
  expect(screen.queryByText('Rent')).not.toBeInTheDocument()
  expect(screen.queryByText('Home Insurance')).not.toBeInTheDocument()
})

test('expanding a parent group reveals its subcategories', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={() => {}} />)
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.click(screen.getByTitle('Expand'))

  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(screen.getByText('Home Insurance')).toBeInTheDocument()
})

test('clicking a parent category selects it directly', () => {
  const onChange = vi.fn()
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={onChange} />)
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.click(screen.getByText('Housing'))
  expect(onChange).toHaveBeenCalledWith(1)
})

test('clicking a subcategory selects it and closes the popover', () => {
  const onChange = vi.fn()
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={onChange} />)
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.click(screen.getByTitle('Expand'))
  fireEvent.click(screen.getByText('Rent'))

  expect(onChange).toHaveBeenCalledWith(2)
  expect(screen.queryByText('Home Insurance')).not.toBeInTheDocument()
})

test('picking "Uncategorized" clears the selection', () => {
  const onChange = vi.fn()
  renderWithProviders(<CategoryPicker categories={categories} value={2} onChange={onChange} />)
  fireEvent.click(screen.getByText('Rent'))
  fireEvent.click(screen.getByText('Uncategorized'))
  expect(onChange).toHaveBeenCalledWith(null)
})

test('searching filters to matching parent and child categories', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={() => {}} />)
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.change(screen.getByPlaceholderText('Search categories…'), { target: { value: 'rent' } })

  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(screen.queryByText('Salary')).not.toBeInTheDocument()
  expect(screen.queryByText('Home Insurance')).not.toBeInTheDocument()
})

test('searching by parent name shows all of its subcategories', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={() => {}} />)
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.change(screen.getByPlaceholderText('Search categories…'), { target: { value: 'housing' } })

  expect(screen.getByText('Housing')).toBeInTheDocument()
  expect(screen.getByText('Rent')).toBeInTheDocument()
  expect(screen.getByText('Home Insurance')).toBeInTheDocument()
  expect(screen.queryByText('Salary')).not.toBeInTheDocument()
})

test('searching with no matches shows an empty message', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={null} onChange={() => {}} />)
  fireEvent.click(screen.getByText('Uncategorized'))
  fireEvent.change(screen.getByPlaceholderText('Search categories…'), { target: { value: 'zzz' } })

  expect(screen.getByText('No matching categories')).toBeInTheDocument()
})

test('allowUncategorized=false hides the Uncategorized option', () => {
  renderWithProviders(<CategoryPicker categories={categories} value={4} onChange={() => {}} allowUncategorized={false} />)
  fireEvent.click(screen.getByText('Salary'))
  expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
})
