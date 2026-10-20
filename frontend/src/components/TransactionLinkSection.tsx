import { useEffect, useState } from 'react'
import { Link2, Pencil } from 'lucide-react'
import {
  Transaction, TransactionLink,
  fetchTransactionLink, renameTransactionLink, unlinkTransactions, deleteTransactionLink,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../utils/currency'
import { formatNet } from '../utils/links'
import { Button, IconButton, Input } from './ui'

interface Props {
  transaction: Transaction
  actorUserId: number | null
  onNavigateToTransaction?: (id: number) => void
  // After a rename or an unlink: the transaction's group now (null: none).
  onChanged: (linkId: number | null) => void
}

// TransactionDetail's "Linked transactions" section: the group this
// transaction belongs to, its members and their net. Renders nothing for a
// transaction that isn't linked; linking happens from the list's selection.
export default function TransactionLinkSection({ transaction, actorUserId, onNavigateToTransaction, onChanged }: Props) {
  const [link, setLink] = useState<TransactionLink | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    setLink(null)
    if (transaction.link_id == null) return
    fetchTransactionLink(transaction.link_id).then(setLink).catch(() => {})
  }, [transaction.id, transaction.link_id])

  if (transaction.link_id == null || link == null) return null

  const run = (call: Promise<TransactionLink | null | void>, after: (result: TransactionLink | null) => void) => {
    setBusy(true)
    call
      .then(result => after(result ?? null))
      .catch(err => showToast(err.message))
      .finally(() => setBusy(false))
  }

  const saveName = () => run(renameTransactionLink(link.id, name.trim() || null), updated => {
    setLink(updated)
    setRenaming(false)
    onChanged(link.id)
  })

  const unlinkThis = () => run(unlinkTransactions(link.id, [transaction.id], actorUserId), () => {
    setLink(null)
    onChanged(null)
  })

  const unlinkAll = () => run(deleteTransactionLink(link.id, actorUserId), () => {
    setLink(null)
    onChanged(null)
  })

  return (
    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-0">
          <Link2 size={15} className="shrink-0 text-accent" />
          <span className="truncate">
            {link.name ? `Linked: ${link.name}` : 'Linked transactions'} ({link.transactions.length})
          </span>
          {!renaming && (
            <IconButton aria-label="Rename the group" onClick={() => { setName(link.name ?? ''); setRenaming(true) }} className="p-1">
              <Pencil size={13} />
            </IconButton>
          )}
        </h4>
        <span className="shrink-0 text-sm font-semibold">Net: {formatNet(link.totals)}</span>
      </div>
      {renaming && (
        <div className="flex gap-2 mb-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            placeholder="Group name"
            aria-label="Group name"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveName() } }}
          />
          <Button size="sm" onClick={saveName} disabled={busy}>Save</Button>
          <Button size="sm" variant="secondary" onClick={() => setRenaming(false)}>Cancel</Button>
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {link.transactions.map(t => {
          const current = t.id === transaction.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigateToTransaction?.(t.id)}
              disabled={current || !onNavigateToTransaction}
              className={`flex justify-between gap-2 text-left text-xs px-1 py-0.5 rounded ${current ? 'bg-slate-100 dark:bg-slate-800 cursor-default' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
            >
              <span className="min-w-0 truncate">
                <span className="text-slate-500 dark:text-slate-400">{t.date}</span>{' '}
                <span className={current ? 'font-semibold' : 'text-accent'}>{t.payee}</span>
                <span className="text-slate-500 dark:text-slate-400"> · {t.account_name}</span>
              </span>
              <span className={`shrink-0 ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoney(t.amount, t.currency)}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button size="sm" variant="secondary" onClick={unlinkThis} disabled={busy}>Unlink this one</Button>
        <Button size="sm" variant="secondary" onClick={unlinkAll} disabled={busy}>Unlink all</Button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
        To add a transaction, tick it in the list with one of these and press Link.
      </p>
    </div>
  )
}
