import { ChartCategoryOut, MonthCategoryChartItem } from '../../api/client'

export function categoryDataKey(categoryId: number | null): string {
  return categoryId === null ? 'uncategorized' : `cat_${categoryId}`
}

export interface PivotedMonthRow {
  month: string
  total: number
  [key: string]: number | string
}

/**
 * Turns the backend's tidy (month, category) list into one row per month
 * with a numeric field per category (recharts' stacked-bar input shape),
 * zero-filling every (month, category) combo missing from the sparse
 * `items` list - including entire months absent because every category was
 * zero that month - so every bar in the requested range has the same set of
 * segments. `total` is the sum of that month's segments, used for the
 * chart's trend line; deriving it here (rather than trusting a backend
 * field) keeps the line mathematically unable to disagree with the bars.
 */
export function pivotMonthCategory(
  items: MonthCategoryChartItem[],
  categories: ChartCategoryOut[],
  months: string[],
): PivotedMonthRow[] {
  const byMonth = new Map<string, Map<string, number>>()
  for (const item of items) {
    const monthEntries = byMonth.get(item.month) ?? new Map<string, number>()
    monthEntries.set(categoryDataKey(item.category_id), item.amount)
    byMonth.set(item.month, monthEntries)
  }

  return months.map(month => {
    const monthEntries = byMonth.get(month)
    const row: PivotedMonthRow = { month, total: 0 }
    for (const category of categories) {
      const value = monthEntries?.get(categoryDataKey(category.category_id)) ?? 0
      row[categoryDataKey(category.category_id)] = value
      row.total += value
    }
    return row
  })
}
