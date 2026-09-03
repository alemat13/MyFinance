import { useState } from 'react'
import {
  Transaction, BulkTransactionUpdate, GlobalSplitWeight,
  Account, Category, User,
  bulkUpdateTransactions,
} from '../api/client'
import { SplitRow } from './SplitEditor'
import TransactionSplitFields from './TransactionSplitFields'
import CategoryPicker from './CategoryPicker'
import { useToast } from '../context/ToastContext'
import { Modal, Button, Select } from './ui'

interface Props {
  transactionIds: number[]
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  allUsers: User[]
  globalWeights: GlobalSplitWeight[]
  selectedUserId: number | null
  onClose: () => void
  onSaved: () => void
}

const ACCOUNTING_MONTH_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const

function offsetLabel(offset: number): string {
  if (offset === 0) return 'No shift'
  const n = Math.abs(offset)
  return `${offset > 0 ? '+' : '-'}${n} month${n === 1 ? '' : 's'}`
}

export default function BulkEditModal({
  transactionIds, transactions, accounts, categories, allUsers, globalWeights, selectedUserId, onClose, onSaved,
}: Props) {
  const [categoryEnabled, setCategoryEnabled] = useState(false)
  const [categoryId, setCategoryId] = useState<number | null>(null)

  const [offsetEnabled, setOffsetEnabled] = useState(false)
  const [offset, setOffset] = useState(0)

  const [splitEnabled, setSplitEnabled] = useState(false)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([])
  const [splitSource, setSplitSource] = useState<'global' | 'account' | 'category' | 'custom' | null>(null)

  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const currencies = [...new Set(transactions.map(t => t.currency))]
  const previewTransaction = transactions[0]

  const canSave = categoryEnabled || offsetEnabled || splitEnabled

  const handleSave = () => {
    const update: BulkTransactionUpdate = {
      ...(categoryEnabled ? { category_id: categoryId } : {}),
      ...(offsetEnabled ? { accounting_month_offset: offset } : {}),
      ...(splitEnabled ? {
        split_weights: splitRows.map(r => ({ user_id: r.user_id, weight: r.value })),
        split_source: (splitSource ?? 'custom') as 'custom',
      } : {}),
    }
    setSaving(true)
    bulkUpdateTransactions(transactionIds, update, selectedUserId)
      .then(res => {
        showToast(`${res.updated_count} transaction(s) updated`, 'success')
        onSaved()
      })
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  return (
    <Modal isOpen size="lg" onClose={onClose} title="Bulk Edit Transactions">
      <div className="flex flex-col gap-4">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          {transactionIds.length} transaction{transactionIds.length === 1 ? '' : 's'} selected
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={categoryEnabled} onChange={e => setCategoryEnabled(e.target.checked)} />
            Change category
          </label>
          {categoryEnabled && (
            <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={offsetEnabled} onChange={e => setOffsetEnabled(e.target.checked)} />
            Shift accounting month
          </label>
          {offsetEnabled && (
            <div>
              <Select value={offset} onChange={e => setOffset(parseInt(e.target.value))} className="min-w-[160px]">
                {ACCOUNTING_MONTH_OFFSETS.map(o => <option key={o} value={o}>{offsetLabel(o)}</option>)}
              </Select>
              <div className="text-xs text-slate-400 mt-1">Applied relative to each transaction's own date.</div>
            </div>
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={splitEnabled} onChange={e => setSplitEnabled(e.target.checked)} />
            Apply new split
          </label>
          {splitEnabled && previewTransaction && (
            <div>
              <TransactionSplitFields
                rows={splitRows}
                onChange={setSplitRows}
                amount={previewTransaction.amount}
                currency={previewTransaction.currency}
                allUsers={allUsers}
                account={null}
                category={null}
                globalWeights={globalWeights}
                source={splitSource}
                onSourceChange={setSplitSource}
              />
              <div className="text-xs text-slate-400 mt-1">
                Preview uses {previewTransaction.payee}'s amount{currencies.length > 1 ? ` (across ${currencies.length} currencies)` : ` (${previewTransaction.currency})`} —
                {' '}each transaction is proportioned against its own amount when applied.
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!canSave || saving}>
            Apply to {transactionIds.length} transaction{transactionIds.length === 1 ? '' : 's'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
