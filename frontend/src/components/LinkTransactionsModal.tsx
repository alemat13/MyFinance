import { useState } from 'react'
import { Transaction, createTransactionLink } from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../utils/currency'
import { commonPayeeText, formatNet, netByCurrency } from '../utils/links'
import { Modal, Button, Input } from './ui'

interface Props {
  transactions: Transaction[]
  selectedUserId: number | null
  onClose: () => void
  onLinked: () => void
}

// The selection bar's "Link": puts the ticked transactions in one group. A
// ticked row that is already linked brings its group along (the server
// merges them), which is also how a row is added to an existing group.
export default function LinkTransactionsModal({ transactions, selectedUserId, onClose, onLinked }: Props) {
  // Prefilled with the text every payee shares, which usually names the group.
  const [name, setName] = useState(() => commonPayeeText(transactions.map(t => t.payee)).slice(0, 100))
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const alreadyLinked = transactions.filter(t => t.link_id != null)
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  const handleLink = () => {
    setSaving(true)
    createTransactionLink(transactions.map(t => t.id), name.trim() || null, selectedUserId)
      .then(link => {
        showToast(`${link.transactions.length} transactions linked`, 'success')
        onLinked()
      })
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  return (
    <Modal isOpen onClose={onClose} title="Link transactions">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Linked transactions stay as they are; each one shows the others and what they add up to.
        </p>
        <div className="flex flex-col gap-1 text-sm">
          {sorted.map(t => (
            <div key={t.id} className="flex justify-between gap-2">
              <span className="truncate">
                <span className="text-slate-500 dark:text-slate-400">{t.date}</span> {t.payee}
                <span className="text-xs text-slate-500 dark:text-slate-400"> · {t.account_name}</span>
              </span>
              <span className={`shrink-0 ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoney(t.amount, t.currency)}
              </span>
            </div>
          ))}
          <div className="flex justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-700 font-semibold">
            <span>Net</span>
            <span>{formatNet(netByCurrency(transactions))}</span>
          </div>
        </div>
        {alreadyLinked.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {alreadyLinked.length === 1 ? 'One of them is' : `${alreadyLinked.length} of them are`} already linked:
            the others will join that group, with its other transactions.
          </p>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name (optional)</span>
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="e.g. Dentist March" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleLink} disabled={saving || transactions.length < 2}>Link</Button>
        </div>
      </div>
    </Modal>
  )
}
