import { Transaction, Account } from '../api/client'

// Not owned by the selected user, but visible because it has a split share for them.
export function sharedShareFor(t: Transaction, selectedUserId: number | null | undefined, accounts: Account[]): number | null {
  if (!selectedUserId) return null
  if (accounts.some(a => a.id === t.account_id)) return null
  const mine = t.splits.find(s => s.user_id === selectedUserId)
  return mine ? mine.share_amount : null
}
