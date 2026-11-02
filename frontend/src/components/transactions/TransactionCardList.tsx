import { Fragment } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { Card, CategoryBadge, IconButton } from '../ui'
import TagChips from '../TagChips'
import { formatMoney } from '../../utils/currency'
import { myShareFor, balanceFor, formatDateGroupHeader } from '../../utils/transactions'
import { CheckpointIcon, CheckpointPeriod, LinkedIcon, TransactionRowsProps } from './rowParts'

/** The Transactions screen's list below `md`: one card per row. */
export default function TransactionCardList({
  transactions, groupByDate, selectedUserId, allAccounts, selectedIds,
  onToggleSelected, onToggleReconciled, onOpen, sumByCurrency,
}: TransactionRowsProps) {
  const showMyColumns = selectedUserId != null
  return (
    <div className="space-y-2">
      {transactions.length === 0 && (
        <div className="text-center py-5 text-sm text-slate-400">No transactions match your filters</div>
      )}
      {transactions.map((t, idx) => {
        const showDateHeader = groupByDate && (idx === 0 || transactions[idx - 1].date !== t.date)
        const myShare = showMyColumns ? myShareFor(t, selectedUserId!) : null
        const balance = showMyColumns ? balanceFor(t, selectedUserId!, allAccounts) : null
        return (
          <Fragment key={t.id}>
            {showDateHeader && (
              <div className="pt-2 pb-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {formatDateGroupHeader(t.date)}
              </div>
            )}
            <Card
              role="button"
              tabIndex={0}
              onClick={() => onOpen(t.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id) } }}
              className={`p-3 cursor-pointer ${t.reconciled ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(t.id)}
                  onChange={() => onToggleSelected(t.id)}
                  onClick={e => e.stopPropagation()}
                  aria-label={`Select transaction ${t.payee}`}
                  className="mt-1.5 shrink-0"
                />
                <IconButton
                  aria-label={t.reconciled ? `Mark ${t.payee} as unreconciled` : `Mark ${t.payee} as reconciled`}
                  onClick={e => { e.stopPropagation(); onToggleReconciled(t) }}
                  className="p-0.5 mt-0.5 shrink-0"
                >
                  {t.reconciled
                    ? <CheckCircle2 size={16} className="text-positive" />
                    : <Circle size={16} className="text-slate-300 dark:text-slate-600" />}
                </IconButton>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {t.link_id != null && <LinkedIcon />}{t.checkpoint_value != null && <CheckpointIcon since={t.checkpoint_since} />}
                      {t.payee}
                    </span>
                    <span className={`shrink-0 font-semibold ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatMoney(t.amount, t.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <CategoryBadge name={t.category_name} color={t.category_color} icon={t.category_icon} />
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{t.account_name}</span>
                  </div>
                  {t.checkpoint_value != null && <CheckpointPeriod since={t.checkpoint_since} className="mt-1" />}
                  {t.tags && t.tags.length > 0 && <div className="mt-1"><TagChips tags={t.tags} /></div>}
                  {showMyColumns && (
                    <div className="flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      <span>My share: <span className={myShare! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{formatMoney(myShare!, t.currency)}</span></span>
                      <span>Balance: <span className={balance! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{formatMoney(balance!, t.currency)}</span></span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </Fragment>
        )
      })}
      {transactions.length > 0 && (
        <div className="flex justify-between text-sm font-semibold pt-2 mt-1 border-t-2 border-slate-300 dark:border-slate-600">
          <span>Total</span>
          <span>{sumByCurrency(t => t.amount)}</span>
        </div>
      )}
    </div>
  )
}
