import { test, expect } from 'vitest'
import { groupCategoriesByParent, isValidParentCandidate, matchesSearch } from '../categoryHierarchy'
import { Category } from '../../api/client'

const cat = (overrides: Partial<Category>): Category => ({
  id: 1, name: 'Category', type: 'Expense', splits: [], parent_id: null, ...overrides,
})

test('groupCategoriesByParent pairs top-level categories with their children', () => {
  const housing = cat({ id: 1, name: 'Housing' })
  const rent = cat({ id: 2, name: 'Rent', parent_id: 1 })
  const insurance = cat({ id: 3, name: 'Home Insurance', parent_id: 1 })
  const salary = cat({ id: 4, name: 'Salary', type: 'Income' })

  const groups = groupCategoriesByParent([housing, rent, insurance, salary])

  expect(groups).toEqual([
    { parent: housing, children: [rent, insurance] },
    { parent: salary, children: [] },
  ])
})

test('groupCategoriesByParent omits subcategories from the top-level list', () => {
  const housing = cat({ id: 1, name: 'Housing' })
  const rent = cat({ id: 2, name: 'Rent', parent_id: 1 })
  const groups = groupCategoriesByParent([housing, rent])
  expect(groups.map(g => g.parent.id)).toEqual([1])
})

test('isValidParentCandidate accepts only top-level categories', () => {
  const housing = cat({ id: 1, name: 'Housing' })
  const rent = cat({ id: 2, name: 'Rent', parent_id: 1 })
  expect(isValidParentCandidate(housing)).toBe(true)
  expect(isValidParentCandidate(rent)).toBe(false)
})

test('isValidParentCandidate excludes the category being edited', () => {
  const housing = cat({ id: 1, name: 'Housing' })
  expect(isValidParentCandidate(housing, 1)).toBe(false)
  expect(isValidParentCandidate(housing, 2)).toBe(true)
})

test('matchesSearch is true for an empty query', () => {
  const rent = cat({ id: 2, name: 'Rent', parent_id: 1 })
  expect(matchesSearch(rent, 'Housing', '')).toBe(true)
  expect(matchesSearch(rent, 'Housing', '   ')).toBe(true)
})

test('matchesSearch matches the category\'s own name, case-insensitively', () => {
  const rent = cat({ id: 2, name: 'Rent' })
  expect(matchesSearch(rent, null, 'ren')).toBe(true)
  expect(matchesSearch(rent, null, 'REN')).toBe(true)
  expect(matchesSearch(rent, null, 'xyz')).toBe(false)
})

test('matchesSearch also matches the parent\'s name', () => {
  const rent = cat({ id: 2, name: 'Rent', parent_id: 1 })
  expect(matchesSearch(rent, 'Housing', 'hous')).toBe(true)
  expect(matchesSearch(rent, null, 'hous')).toBe(false)
})
