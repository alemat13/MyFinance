// How the Transactions screen starts: every filter, sort and paging setting
// is read back from the URL (and the date order from localStorage), so a
// link or a reload reopens the screen exactly as it was.
import { HistoryGroupRef } from '../../api/client'
import { ConditionItemRow, ConditionRow } from '../TransactionConditions'
import { getParam } from '../../utils/urlState'

export type FilterMode = 'simple' | 'advanced'

export const SORT_BY_VALUES = ['date', 'amount', 'payee', 'created_at'] as const
export const SORT_DIR_VALUES = ['asc', 'desc'] as const
export const PAGE_SIZE_VALUES = [25, 50, 100] as const
// The date order picked with the Newest/Oldest first toggle, remembered across visits.
export const SORT_DIR_STORAGE_KEY = 'transactionsSortDir'

export function loadInitialMode(): FilterMode {
  return getParam('mode') === 'advanced' ? 'advanced' : 'simple'
}

const isRow = (c: unknown): c is ConditionRow =>
  !!c && typeof c === 'object' && typeof (c as ConditionRow).field === 'string'
  && typeof (c as ConditionRow).operator === 'string'

export function loadInitialConditions(): ConditionItemRow[] {
  const raw = getParam('conditions')
  if (!raw) return []
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(parsed)) return []
    // A group of conditions keeps only its well-formed rows.
    return parsed.flatMap((c): ConditionItemRow[] => {
      if (isRow(c)) return [c]
      if (c && typeof c === 'object' && Array.isArray(c.conditions)) {
        const rows = c.conditions.filter(isRow)
        return rows.length > 0 ? [{ matchMode: c.matchMode === 'all' ? 'all' : 'any', conditions: rows }] : []
      }
      return []
    })
  } catch {
    return []
  }
}

// The History entry whose transactions the screen is limited to, if it was
// opened from History's "Open in Transactions".
export function loadInitialHistoryGroup(): HistoryGroupRef | null {
  const raw = getParam('history_group')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed?.first_id === 'number' && typeof parsed?.last_id === 'number' ? parsed : null
  } catch {
    return null
  }
}

export function loadInitialInt(name: string, fallback: number): number {
  const parsed = parseInt(getParam(name) ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

// An id list param ("3,5"), which an older single-id link still reads as.
export function loadInitialIds(name: string): number[] {
  return (getParam(name) ?? '').split(',').map(v => parseInt(v, 10)).filter(n => Number.isFinite(n) && n !== 0)
}

/** A saved filter's account/category: one id (0 for none) or a list. */
export const savedIds = (v: number | number[] | undefined): number[] =>
  Array.isArray(v) ? v : v ? [v] : []
/** The other way round, so a filter of one id saves the way it always did. */
export const idsToSaved = (ids: number[]): number | number[] => ids.length === 0 ? 0 : ids.length === 1 ? ids[0] : ids

export function loadInitialPageSize(): number {
  const parsed = parseInt(getParam('page_size') ?? '', 10)
  return (PAGE_SIZE_VALUES as readonly number[]).includes(parsed) ? parsed : 50
}

export function loadInitialSortBy(): typeof SORT_BY_VALUES[number] {
  const val = getParam('sort_by')
  return (SORT_BY_VALUES as readonly string[]).includes(val ?? '') ? (val as typeof SORT_BY_VALUES[number]) : 'date'
}

export function loadInitialSortDir(): typeof SORT_DIR_VALUES[number] {
  let val = getParam('sort_dir')
  if (val === null) {
    try { val = localStorage.getItem(SORT_DIR_STORAGE_KEY) } catch { val = null }
  }
  return (SORT_DIR_VALUES as readonly string[]).includes(val ?? '') ? (val as typeof SORT_DIR_VALUES[number]) : 'desc'
}
