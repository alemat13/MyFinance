import { Flag, Link2 } from 'lucide-react'
import { Account, Transaction, TransactionSplit } from '../../api/client'
import { formatMoney } from '../../utils/currency'
import { checkpointPeriodLabel } from '../../utils/transactions'

/** What the mobile card list and the desktop table both need from the page. */
export interface TransactionRowsProps {
  transactions: Transaction[]
  // Rows sorted by date get a header line per day.
  groupByDate: boolean
  // The "My share"/"Balance" columns show only with a user selected.
  selectedUserId: number | null
  allAccounts: Account[]
  selectedIds: Set<number>
  onToggleSelected: (id: number) => void
  onToggleReconciled: (t: Transaction) => void
  onOpen: (id: number) => void
  // The page's total of `values` over its rows, one figure per currency.
  sumByCurrency: (values: (t: Transaction) => number) => string
}

export const splitsDisplay = (splits: TransactionSplit[], currency: string) => {
  if (splits.length === 0) return <span className="text-slate-400">—</span>
  return splits.map(s => `${s.user_name} ${formatMoney(s.share_amount, currency)}`).join(' / ')
}

// Marks a checkpoint: a row stating what its account is worth, whose amount
// is worked out from that value.
export function CheckpointIcon({ since }: { since?: string | null }) {
  return (
    <span title={`Checkpoint: gain or loss ${checkpointPeriodLabel(since)}`} className="inline-flex align-[-2px] text-accent mx-1">
      <Flag size={14} aria-label="Checkpoint" />
    </span>
  )
}

// The period a checkpoint's amount covers, on its own line under the payee.
export function CheckpointPeriod({ since, className = '' }: { since?: string | null; className?: string }) {
  return (
    <div className={`text-xs text-slate-500 dark:text-slate-400 ${className}`} data-testid="checkpoint-period">
      Gain/loss {checkpointPeriodLabel(since)}
    </div>
  )
}

// Marks a transaction that belongs to a group of linked ones; the group itself
// is shown in the detail panel.
export function LinkedIcon() {
  return (
    <span title="Linked to other transactions" className="inline-flex align-[-2px] text-accent mx-1">
      <Link2 size={14} aria-label="Linked" />
    </span>
  )
}
