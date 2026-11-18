import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react'
import {
  Account, Category, PendingTransaction,
  dismissPendingTransaction, fetchPendingTransactions, reconcilePendingTransaction, updatePendingTransaction,
} from '../../api/client'
import { Badge, Button, CategoryBadge, Input, Modal } from '../ui'
import CategoryPicker from '../CategoryPicker'
import { formatMoney } from '../../utils/currency'
import { formatDateGroupHeader } from '../../utils/transactions'
import { useToast } from '../../context/ToastContext'

interface Props {
  // The accounts whose pending operations to show (the page's account filter,
  // else every account visible to the selected user).
  accountIds: number[]
  accounts: Account[]
  categories: Category[]
  // Called after a pending row's edits went to a transaction, which the page
  // then reloads.
  onTransactionsChanged: () => void
}

// Linxo-like hatching: a pending row reads at a glance as not real yet.
const HATCH = 'bg-[repeating-linear-gradient(135deg,transparent_0,transparent_6px,rgba(148,163,184,0.12)_6px,rgba(148,163,184,0.12)_12px)]'

/** Pending bank operations above the transaction list (MYF-82): greyed,
 *  hatched, outside every balance, with the projected balance when one
 *  account is shown. */
export default function PendingSection({ accountIds, accounts, categories, onTransactionsChanged }: Props) {
  const [rows, setRows] = useState<PendingTransaction[]>([])
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState<PendingTransaction | null>(null)
  const key = accountIds.join(',')

  const load = () => {
    if (accountIds.length === 0) { setRows([]); return }
    fetchPendingTransactions(accountIds).then(setRows).catch(err => console.error(err))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [key])

  if (rows.length === 0) return null

  const accountOf = (id: number) => accounts.find(a => a.id === id)
  const single = accountIds.length === 1 ? accountOf(accountIds[0]) : undefined
  const stillPending = rows.filter(r => r.status === 'pending')
  const pendingTotal = stillPending.reduce((sum, r) => sum + r.amount, 0)
  const toReconcile = rows.length - stillPending.length

  return (
    <section className="mb-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-600" aria-label="Pending operations">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Clock size={16} className="text-slate-500" />
        <span className="font-medium text-slate-700 dark:text-slate-200">
          Pending ({stillPending.length})
        </span>
        {toReconcile > 0 && <Badge variant="warning">{toReconcile} to reconcile</Badge>}
        {single && (
          <span className="ml-auto text-slate-600 dark:text-slate-300" data-testid="projected-balance">
            Projected balance{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {formatMoney(single.balance + pendingTotal, single.currency)}
            </strong>
          </span>
        )}
      </button>
      {open && (
        <ul className="border-t border-dashed border-slate-300 dark:border-slate-600">
          {rows.map(r => {
            const account = accountOf(r.account_id)
            const category = r.category_id != null ? categories.find(c => c.id === r.category_id) : undefined
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 ${HATCH}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-slate-700 dark:text-slate-200">{r.payee}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{formatDateGroupHeader(r.date)}</span>
                      {accountIds.length > 1 && account && <span>· {account.name}</span>}
                      {r.status === 'pending'
                        ? <Badge>Pending</Badge>
                        : <Badge variant="warning">To reconcile</Badge>}
                      {category && <CategoryBadge name={category.name} color={category.color} icon={category.icon} />}
                    </div>
                  </div>
                  <span className={`shrink-0 font-medium tabular-nums ${r.amount < 0 ? 'text-slate-500 dark:text-slate-400' : 'text-positive/70'}`}>
                    {formatMoney(r.amount, account?.currency ?? 'EUR')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {editing && (
        <PendingEditModal
          pending={editing}
          currency={accountOf(editing.account_id)?.currency ?? 'EUR'}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={changedTransactions => {
            setEditing(null)
            load()
            if (changedTransactions) onTransactionsChanged()
          }}
        />
      )}
    </section>
  )
}

interface EditProps {
  pending: PendingTransaction
  currency: string
  categories: Category[]
  onClose: () => void
  onDone: (changedTransactions: boolean) => void
}

function PendingEditModal({ pending, currency, categories, onClose, onDone }: EditProps) {
  const [payee, setPayee] = useState(pending.payee)
  const [categoryId, setCategoryId] = useState<number | null>(pending.category_id ?? null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const reconciling = pending.status === 'to_reconcile'

  const run = async (action: () => Promise<unknown>, changedTransactions: boolean, message: string) => {
    setBusy(true)
    try {
      await action()
      showToast(message, 'success')
      onDone(changedTransactions)
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
      setBusy(false)
    }
  }

  const save = () => run(
    () => updatePendingTransaction(pending.id, { payee: payee.trim() || null, category_id: categoryId }),
    false, 'Kept for when the bank books it',
  )

  return (
    <Modal isOpen onClose={onClose} title={reconciling ? 'Operation to reconcile' : 'Pending operation'}>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
          <span>{formatDateGroupHeader(pending.date)}</span>
          <strong className="tabular-nums">{formatMoney(pending.amount, currency)}</strong>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 break-words">
          Bank wording: {pending.memo || pending.bank_payee}
        </div>

        {reconciling ? (
          <ReconcileChoices pending={pending} currency={currency} busy={busy}
            onPick={id => run(() => reconcilePendingTransaction(pending.id, id), true, 'Changes applied to the transaction')}
            onDismiss={() => run(() => dismissPendingTransaction(pending.id), false, 'Pending operation dismissed')}
          />
        ) : (
          <>
            <p className="text-slate-500 dark:text-slate-400">
              Not in any balance yet. What you set here goes to the transaction once the bank books it.
            </p>
            <label className="block">
              <span className="block mb-1 text-slate-600 dark:text-slate-300">Payee</span>
              <Input value={payee} onChange={e => setPayee(e.target.value)} className="w-full" maxLength={200} />
            </label>
            <label className="block">
              <span className="block mb-1 text-slate-600 dark:text-slate-300">Category</span>
              <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} className="w-full" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy}>Save</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function ReconcileChoices({ pending, currency, busy, onPick, onDismiss }: {
  pending: PendingTransaction
  currency: string
  busy: boolean
  onPick: (transactionId: number) => void
  onDismiss: () => void
}) {
  return (
    <>
      <p className="text-slate-500 dark:text-slate-400">
        The bank no longer shows this operation as pending, and it could not tell which transaction it became.
        Pick it to apply your changes{pending.category_id != null || pending.payee !== pending.bank_payee ? ` (${pending.payee})` : ''},
        or dismiss it if it was cancelled.
      </p>
      {pending.candidates.length === 0 ? (
        <p className="italic text-slate-500">No transaction of this account matches yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 rounded-md border border-slate-200 dark:border-slate-700">
          {pending.candidates.map(c => (
            <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate">{c.payee}</div>
                <div className="text-xs text-slate-500">{formatDateGroupHeader(c.date)}</div>
              </div>
              <span className="tabular-nums">{formatMoney(c.amount, currency)}</span>
              <Button size="sm" onClick={() => onPick(c.id)} disabled={busy}>This one</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end pt-1">
        <Button variant="secondary" onClick={onDismiss} disabled={busy}>Dismiss</Button>
      </div>
    </>
  )
}
