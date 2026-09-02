import { Transaction, Account } from '../api/client'

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
// placeholder value (0).
export function validateTransactionForm(payee: string | null | undefined, accountId: number | null | undefined): string | null {
  if (!payee || !accountId) return 'Payee and account are required'
  return null
}
