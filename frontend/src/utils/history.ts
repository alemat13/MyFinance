import { Category, HistoryEntry, TransactionHistoryEntry, User } from '../api/client'
import { categoryNameFor } from './categoryDisplay'

export const historyBadgeVariant = (action: TransactionHistoryEntry['action']) =>
  action === 'created' ? 'positive' : action === 'deleted' ? 'negative' : 'info'

// What wrote the row, when it wasn't somebody typing. Worth naming on the
// badge rather than leaving every line reading "updated": an automatic
// categorization is exactly the kind of change you need to be able to find
// and judge afterwards, and a sync and a divide are no different.
export const HISTORY_SOURCE_LABELS: Record<string, string> = {
  csv_import: 'CSV',
  bank_sync: 'bank sync',
  categorizer: 'auto',
  divide: 'divide',
  admin: 'admin',
  rule: 'rule',
  bulk: 'bulk edit',
}

interface SplitSnapshotEntry {
  user_id: number
  weight: number
  source: string
}

const describeSplitsChange = (change: { old: SplitSnapshotEntry[] | null; new: SplitSnapshotEntry[] | null }, users: User[]) => {
  const nameFor = (id: number) => users.find(u => u.id === id)?.name ?? `User ${id}`
  const weightsById = (entries: SplitSnapshotEntry[] | null) => new Map((entries ?? []).map(e => [e.user_id, e.weight]))
  const oldWeights = weightsById(change.old)
  const newWeights = weightsById(change.new)
  const userIds = [...new Set([...oldWeights.keys(), ...newWeights.keys()])].sort((a, b) => a - b)
  return `splits: ${userIds.map(id => `${nameFor(id)} ${oldWeights.get(id) ?? 0}→${newWeights.get(id) ?? 0}`).join(', ')}`
}

const describeCategoryChange = (change: { old: unknown; new: unknown }, categories: Category[]) =>
  `category: ${categoryNameFor(change.old as number | null, categories)} → ${categoryNameFor(change.new as number | null, categories)}`

// Tag names as they were then, so a tag renamed or deleted since still reads right.
const describeTagsChange = (change: { old: unknown; new: unknown }) => {
  const before = (change.old as string[] | null) ?? []
  const after = (change.new as string[] | null) ?? []
  const added = after.filter(n => !before.includes(n))
  const removed = before.filter(n => !after.includes(n))
  return [
    added.length > 0 ? `tags added: ${added.join(', ')}` : null,
    removed.length > 0 ? `tags removed: ${removed.join(', ')}` : null,
  ].filter(Boolean).join(', ')
}

const describeReconciledChange = (change: { old: unknown; new: unknown }) =>
  `Reconciled: ${change.old ? 'Yes' : 'No'} → ${change.new ? 'Yes' : 'No'}`

export const describeHistoryChanges = (changes: TransactionHistoryEntry['changes'], users: User[], categories: Category[]) =>
  changes
    ? Object.entries(changes).map(([field, value]) =>
        field === 'splits'
          ? describeSplitsChange(value as { old: SplitSnapshotEntry[] | null; new: SplitSnapshotEntry[] | null }, users)
          : field === 'category_id'
          ? describeCategoryChange(value, categories)
          : field === 'reconciled'
          ? describeReconciledChange(value)
          : field === 'tags'
          ? describeTagsChange(value)
          : `${field}: ${value.old ?? '—'} → ${value.new ?? '—'}`
      ).join(', ')
    : ''

export const historyBadgeLabel = (action: string, source: string | null) =>
  `${action}${source && HISTORY_SOURCE_LABELS[source] ? ` · ${HISTORY_SOURCE_LABELS[source]}` : ''}`

// What a History group's rows have in common (history.summary() on the
// server): only the new value, the old one being each row's own.
export const describeGroupChanges = (changes: HistoryEntry['changes'], users: User[], categories: Category[]) =>
  changes
    ? Object.entries(changes).map(([field, value]) => {
        if (field === 'tags') {
          return [
            value.added && value.added.length > 0 ? `tags added: ${value.added.join(', ')}` : null,
            value.removed && value.removed.length > 0 ? `tags removed: ${value.removed.join(', ')}` : null,
          ].filter(Boolean).join(', ')
        }
        if (value.mixed) return `${field} changed`
        if (field === 'splits') {
          const nameFor = (id: number) => users.find(u => u.id === id)?.name ?? `User ${id}`
          const entries = (value.new as SplitSnapshotEntry[] | null) ?? []
          return `splits: ${entries.map(e => `${nameFor(e.user_id)} ${e.weight}`).join(', ')}`
        }
        if (field === 'category_id') return `category → ${categoryNameFor(value.new as number | null, categories)}`
        if (field === 'reconciled') return `Reconciled → ${value.new ? 'Yes' : 'No'}`
        return `${field} → ${value.new ?? '—'}`
      }).join(', ')
    : ''
