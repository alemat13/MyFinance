import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Transaction, TransactionDividePart, Category, divideTransaction } from '../api/client'
import CategoryPicker from './CategoryPicker'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../utils/currency'
import { ACCOUNTING_MONTH_OFFSETS, accountingMonthLabel } from '../utils/transactions'
import { Modal, Button, Input, Select, IconButton } from './ui'

interface Props {
  transaction: Transaction
  categories: Category[]
  selectedUserId: number | null
  onClose: () => void
  onDivided: (transactions: Transaction[]) => void
}

interface PartRow {
  date: string
  payee: string
  memo: string
  amount: number
  category_id: number | null
  accounting_month_offset: number
}

function rowFromTransaction(t: Transaction, amount: number, category_id: number | null): PartRow {
  return {
    date: t.date,
    payee: t.payee,
    memo: t.memo ?? '',
    amount,
    category_id,
    accounting_month_offset: t.accounting_month_offset,
  }
}

export default function TransactionDivideModal({ transaction, categories, selectedUserId, onClose, onDivided }: Props) {
  const [parts, setParts] = useState<PartRow[]>(() => [
    rowFromTransaction(transaction, transaction.amount, transaction.category_id),
    rowFromTransaction(transaction, 0, null),
  ])
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const updatePart = (idx: number, patch: Partial<PartRow>) => {
    setParts(parts.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  const addPart = () => {
    setParts([...parts, rowFromTransaction(transaction, 0, null)])
  }

  const removePart = (idx: number) => {
    if (parts.length <= 2) return
    setParts(parts.filter((_, i) => i !== idx))
  }

  const allocated = parts.reduce((sum, p) => sum + p.amount, 0)
  const remaining = transaction.amount - allocated
  const remainingOk = Math.abs(remaining) <= 0.01
  const allPayeesFilled = parts.every(p => p.payee.trim().length > 0)
  const allAmountsNonZero = parts.every(p => p.amount !== 0)
  const canSubmit = parts.length >= 2 && remainingOk && allPayeesFilled && allAmountsNonZero && !saving

  const submit = () => {
    if (!canSubmit) return
    setSaving(true)
    const payload: { parts: TransactionDividePart[] } = {
      parts: parts.map(p => ({
        date: p.date,
        payee: p.payee,
        memo: p.memo || null,
        amount: p.amount,
        category_id: p.category_id,
        accounting_month_offset: p.accounting_month_offset,
      })),
    }
    divideTransaction(transaction.id, payload, selectedUserId)
      .then(res => onDivided(res.transactions))
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  return (
    <Modal isOpen size="lg" onClose={onClose} title="Divide transaction">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Split this transaction's {formatMoney(transaction.amount, transaction.currency)} into separate
          transactions — by category, by date, or both. Each part's own user-split is resolved automatically
          and can be fine-tuned afterward.
        </p>

        <div className="flex flex-col gap-2">
          {parts.map((p, i) => (
            <div key={i} className="flex gap-1.5 items-end flex-wrap p-2 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <Input type="date" value={p.date} onChange={e => updatePart(i, { date: e.target.value })} />
              <Select
                value={p.accounting_month_offset}
                onChange={e => updatePart(i, { accounting_month_offset: parseInt(e.target.value) })}
                className="min-w-[150px]"
              >
                {ACCOUNTING_MONTH_OFFSETS.map(o => (
                  <option key={o} value={o}>{accountingMonthLabel(p.date, o)}</option>
                ))}
              </Select>
              <Input placeholder="Payee" value={p.payee} onChange={e => updatePart(i, { payee: e.target.value })} className="min-w-[120px]" />
              <Input placeholder="Memo" value={p.memo} onChange={e => updatePart(i, { memo: e.target.value })} className="min-w-[120px]" />
              <Input
                placeholder="Amount"
                type="number"
                step="0.01"
                value={p.amount}
                onChange={e => updatePart(i, { amount: parseFloat(e.target.value) || 0 })}
                className="w-[100px]"
              />
              <CategoryPicker
                categories={categories}
                value={p.category_id}
                onChange={id => updatePart(i, { category_id: id })}
                className="min-w-[140px]"
              />
              <IconButton aria-label="Remove part" onClick={() => removePart(i)} disabled={parts.length <= 2}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={addPart}>
            <Plus size={14} /> Add part
          </Button>
          <div className={`text-xs ${remainingOk ? 'text-slate-500 dark:text-slate-400' : 'text-negative'}`}>
            Remaining to allocate: {formatMoney(remaining, transaction.currency)}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={submit} disabled={!canSubmit}>Divide</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
