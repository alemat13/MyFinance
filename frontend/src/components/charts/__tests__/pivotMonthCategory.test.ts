import { describe, test, expect } from 'vitest'
import { categoryDataKey, pivotMonthCategory } from '../pivotMonthCategory'

const categories = [
  { category_id: 2, name: 'Rent', color: '#dc2626', icon: null },
  { category_id: 3, name: 'Groceries', color: '#16a34a', icon: null },
  { category_id: null, name: 'Uncategorized', color: null, icon: null },
]

describe('categoryDataKey', () => {
  test('maps a category id to a namespaced key', () => {
    expect(categoryDataKey(2)).toBe('cat_2')
  })

  test('maps null to the uncategorized key', () => {
    expect(categoryDataKey(null)).toBe('uncategorized')
  })
})

describe('pivotMonthCategory', () => {
  test('zero-fills missing (month, category) combos', () => {
    const items = [
      { month: '2026-01', category_id: 2, amount: -100, currency: 'EUR' },
    ]
    const result = pivotMonthCategory(items, categories, ['2026-01', '2026-02'])

    expect(result).toEqual([
      { month: '2026-01', total: -100, cat_2: -100, cat_3: 0, uncategorized: 0 },
      { month: '2026-02', total: 0, cat_2: 0, cat_3: 0, uncategorized: 0 },
    ])
  })

  test('computes total as the sum of all segments for that month', () => {
    const items = [
      { month: '2026-01', category_id: 2, amount: -100, currency: 'EUR' },
      { month: '2026-01', category_id: 3, amount: -50, currency: 'EUR' },
      { month: '2026-01', category_id: null, amount: -10, currency: 'EUR' },
    ]
    const result = pivotMonthCategory(items, categories, ['2026-01'])

    expect(result[0].total).toBe(-160)
  })

  test('preserves the given category order in each row', () => {
    const result = pivotMonthCategory([], categories, ['2026-01'])
    expect(Object.keys(result[0])).toEqual(['month', 'total', 'cat_2', 'cat_3', 'uncategorized'])
  })

  test('an empty months list returns no rows', () => {
    expect(pivotMonthCategory([], categories, [])).toEqual([])
  })
})
