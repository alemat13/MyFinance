import { describe, expect, test } from 'vitest'
import { simpleFiltersToConditions } from '../rules'

describe('simpleFiltersToConditions', () => {
  test('maps every filter a rule can hold', () => {
    expect(simpleFiltersToConditions({
      search: ' sfr ', account_id: 2, category_id: 3, amount_min: -50, amount_max: -10,
      date_from: '2026-01-01', date_to: '2026-01-31', reconciled: true,
    })).toEqual([
      { field: 'payee', operator: 'contains', value: 'sfr' },
      { field: 'account_id', operator: 'in', value: [2] },
      { field: 'category_id', operator: 'in', value: [3] },
      { field: 'amount', operator: 'between', value: -50, value2: -10 },
      { field: 'date', operator: 'between', value: '2026-01-01', value2: '2026-01-31' },
    ])
  })

  test('one-sided bounds stay inclusive', () => {
    expect(simpleFiltersToConditions({ amount_min: 0, date_from: '2026-03-01' })).toEqual([
      { field: 'amount', operator: 'gte', value: 0 },
      { field: 'date', operator: 'after', value: '2026-02-28' },
    ])
    expect(simpleFiltersToConditions({ date_to: '2026-12-31' })).toEqual([
      { field: 'date', operator: 'before', value: '2027-01-01' },
    ])
  })

  test('several accounts and categories, Uncategorized as a null in the list', () => {
    expect(simpleFiltersToConditions({ account_ids: [2, 5], category_ids: [3], uncategorized: true })).toEqual([
      { field: 'account_id', operator: 'in', value: [2, 5] },
      { field: 'category_id', operator: 'in', value: [3, null] },
    ])
  })

  test('nothing set gives nothing', () => {
    expect(simpleFiltersToConditions({ page: 1, page_size: 50 })).toEqual([])
  })
})
