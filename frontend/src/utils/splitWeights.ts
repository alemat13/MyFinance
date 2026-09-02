import { Account, Category, GlobalSplitWeight, SplitSource } from '../api/client'
import { SplitRow } from '../components/SplitEditor'

/**
 * TypeScript port of backend split_engine.prorate — must stay algorithmically
 * identical (same sort/rounding/remainder rule) so the live UI preview never
 * disagrees with what the backend persists.
 */
export function prorateWeights(
  amount: number,
  rows: { user_id: number; weight: number }[],
): { user_id: number; share_amount: number }[] {
  if (rows.length === 0) return []

  const total = rows.reduce((s, r) => s + r.weight, 0)
  const ordered = [...rows].sort((a, b) => a.user_id - b.user_id)

  if (total <= 0) {
    return ordered.map(r => ({ user_id: r.user_id, share_amount: 0 }))
  }

  const round2 = (n: number) => Math.round(n * 100) / 100

  let running = 0
  const shares: { user_id: number; share_amount: number }[] = []
  for (const r of ordered.slice(0, -1)) {
    const share = round2((amount * r.weight) / total)
    shares.push({ user_id: r.user_id, share_amount: share })
    running += share
  }
  const last = ordered[ordered.length - 1]
  shares.push({ user_id: last.user_id, share_amount: round2(amount - running) })
  return shares
}

/**
 * Client-side mirror of backend split_engine.resolve_default_weights:
 * category > account > global > none. Used to prefill a new/edited
 * transaction's weight fields without a round trip.
 */
export function resolveDefaultSplitRows(
  category: Category | null,
  account: Account | null,
  globalWeights: GlobalSplitWeight[],
): { rows: SplitRow[]; source: SplitSource | null } {
  if (category && category.splits.length > 0) {
    return {
      rows: category.splits.map(s => ({ user_id: s.user_id, value: s.weight })),
      source: 'category',
    }
  }
  if (account && account.split_weights.length > 0) {
    return {
      rows: account.split_weights.map(w => ({ user_id: w.user_id, value: w.weight })),
      source: 'account',
    }
  }
  const positiveGlobal = globalWeights.filter(w => w.weight > 0)
  if (positiveGlobal.length > 0) {
    return {
      rows: positiveGlobal.map(w => ({ user_id: w.user_id, value: w.weight })),
      source: 'global',
    }
  }
  return { rows: [], source: null }
}
