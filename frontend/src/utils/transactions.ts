import { Transaction, Account } from '../api/client'

export const ACCOUNTING_MONTH_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const

export function accountingMonthLabel(dateStr: string, offset: number): string {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
  const target = new Date(base.getFullYear(), base.getMonth() + offset, 1)
  const name = target.toLocaleString('default', { month: 'long' })
  return offset === 0 ? name : `${name} (${offset > 0 ? '+' : ''}${offset})`
}

// Not owned by the selected user, but visible because it has a split share for them.
export function sharedShareFor(t: Transaction, selectedUserId: number | null | undefined, accounts: Account[]): number | null {
  if (!selectedUserId) return null
  if (accounts.some(a => a.id === t.account_id)) return null
  const mine = t.splits.find(s => s.user_id === selectedUserId)
  return mine ? mine.share_amount : null
}

export function formatDateGroupHeader(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Shared by the "new transaction" inline form and TransactionDetail's edit
// form. account_id is falsy both when unset and when left at the select's
// placeholder value (0). split is optional so callers that don't manage a
// split (e.g. bulk edit) can keep using this without passing one.
export function validateTransactionForm(
  payee: string | null | undefined,
  accountId: number | null | undefined,
  split?: { user_id: number, value: number }[],
): string | null {
  if (!payee || !accountId) return 'Payee and account are required'
  if (split && split.length === 0) return 'Add at least one person to the split'
  return null
}
