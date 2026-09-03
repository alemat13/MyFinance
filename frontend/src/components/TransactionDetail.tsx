import { useEffect, useState } from 'react'
import {
  Transaction, TransactionUpdate, TransactionHistoryEntry, GlobalSplitWeight, SplitSource,
  Account, Category, User,
  fetchTransaction, createTransaction, updateTransaction, deleteTransaction, fetchTransactionHistory,
} from '../api/client'
import { SplitRow } from './SplitEditor'
import TransactionSplitFields from './TransactionSplitFields'
import CategoryPicker from './CategoryPicker'
import { useToast } from '../context/ToastContext'
import { validateTransactionForm } from '../utils/transactions'
import { resolveDefaultSplitRows } from '../utils/splitWeights'
import { Modal, Button, Input, Select, StatusMessage, ConfirmDialog, Badge } from './ui'

interface Props {
  transactionId: number | null
  accounts: Account[]
  categories: Category[]
  allUsers: User[]
  globalWeights: GlobalSplitWeight[]
  selectedUserId: number | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

const ACCOUNTING_MONTH_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const

const emptyFormData: TransactionUpdate = {
  date: new Date().toISOString().slice(0, 10),
  payee: '',
  memo: '',
  amount: 0,
  account_id: 0,
  category_id: 0,
  accounting_month_offset: 0,
}

function accountingMonthLabel(dateStr: string, offset: number): string {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
  const target = new Date(base.getFullYear(), base.getMonth() + offset, 1)
  const name = target.toLocaleString('default', { month: 'long' })
  return offset === 0 ? name : `${name} (${offset > 0 ? '+' : ''}${offset})`
}

const historyBadgeVariant = (action: TransactionHistoryEntry['action']) =>
  action === 'created' ? 'positive' : action === 'deleted' ? 'negative' : 'info'

interface SplitSnapshotEntry {
  user_id: number
  weight: number
  source: string
}

const describeSplitsChange = (change: { old: SplitSnapshotEntry[] | null; new: SplitSnapshotEntry[] | null }, users: User[]) => {
  const nameFor = (id: number) => users.find(u => u.id === id)?.name ?? `User ${id}`
  const weightsById = (entries: SplitSnapshotEntry[] | null) => new Map((entries ?? []).map(e => [e.user_id, e.weight]))
  const oldWeights = weightsById(change.old)
  const newWeights = weightsById(change.new)
  const userIds = [...new Set([...oldWeights.keys(), ...newWeights.keys()])].sort((a, b) => a - b)
  return `splits: ${userIds.map(id => `${nameFor(id)} ${oldWeights.get(id) ?? 0}→${newWeights.get(id) ?? 0}`).join(', ')}`
}

const describeHistoryChanges = (changes: TransactionHistoryEntry['changes'], users: User[]) =>
  changes
    ? Object.entries(changes).map(([field, value]) =>
        field === 'splits'
          ? describeSplitsChange(value as { old: SplitSnapshotEntry[] | null; new: SplitSnapshotEntry[] | null }, users)
          : `${field}: ${value.old ?? '—'} → ${value.new ?? '—'}`
      ).join(', ')
    : ''

export default function TransactionDetail({
  transactionId, accounts, categories, allUsers, globalWeights, selectedUserId, onClose, onSaved, onDeleted,
}: Props) {
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(transactionId !== null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<TransactionUpdate>(() => transactionId === null ? emptyFormData : {})
  const [split, setSplit] = useState<SplitRow[]>([])
  const [splitSource, setSplitSource] = useState<SplitSource | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<TransactionHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(transactionId !== null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (transactionId === null) return

    setLoading(true)
    setError(null)
    fetchTransaction(transactionId, selectedUserId)
      .then(t => {
        setTransaction(t)
        setFormData({
          date: t.date,
          payee: t.payee,
          memo: t.memo,
          amount: t.amount,
          account_id: t.account_id,
          category_id: t.category_id,
          accounting_month_offset: t.accounting_month_offset,
        })
        // Always populated from the transaction's own stored weights — never
        // re-prefilled from current tier config while editing. The 3 quick
        // buttons are the only way to pull a tier's weights into this form.
        setSplit(t.splits.map(s => ({ user_id: s.user_id, value: s.weight })))
        setSplitSource(t.splits[0]?.source ?? null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))

    setHistoryLoading(true)
    setHistoryError(null)
    fetchTransactionHistory(transactionId)
      .then(setHistoryEntries)
      .catch(err => setHistoryError(err.message))
      .finally(() => setHistoryLoading(false))
  }, [transactionId, selectedUserId])

  // Prefill a new transaction's split from category > account > global priority
  // whenever category/account selection changes — but never once the user has
  // hand-edited weights (source === 'custom'), which always wins. Editing an
  // existing transaction never re-prefills like this (see comment above).
  useEffect(() => {
    if (transactionId !== null || splitSource === 'custom') return
    const category = categories.find(c => c.id === formData.category_id) ?? null
    const account = accounts.find(a => a.id === formData.account_id) ?? null
    const { rows, source } = resolveDefaultSplitRows(category, account, globalWeights)
    setSplit(rows)
    setSplitSource(source)
  }, [transactionId, formData.category_id, formData.account_id])

  const save = () => {
    const validationError = validateTransactionForm(formData.payee, formData.account_id)
    if (validationError) {
      showToast(validationError); return
    }
    const request = transactionId === null
      ? createTransaction({
          date: formData.date || new Date().toISOString().slice(0, 10),
          payee: formData.payee ?? '',
          memo: formData.memo,
          amount: formData.amount ?? 0,
          account_id: formData.account_id ?? 0,
          category_id: formData.category_id || null,
          accounting_month_offset: formData.accounting_month_offset,
          split_weights: split.length > 0 ? split.map(r => ({ user_id: r.user_id, weight: r.value })) : undefined,
          split_source: split.length > 0 ? (splitSource ?? 'custom') : undefined,
        }, selectedUserId)
      : updateTransaction(transactionId, {
          ...formData,
          category_id: formData.category_id || null,
          split_weights: split.map(r => ({ user_id: r.user_id, weight: r.value })),
          split_source: splitSource ?? 'custom',
        }, selectedUserId)
    request.then(() => onSaved()).catch(err => showToast(err.message))
  }

  const confirmDelete = () => {
    if (transactionId === null) return
    deleteTransaction(transactionId, selectedUserId)
      .then(() => onDeleted())
      .catch(err => showToast(err.message))
      .finally(() => setConfirmingDelete(false))
  }

  const currency = accounts.find(a => a.id === formData.account_id)?.currency ?? 'EUR'
  const acctOptions = accounts.map(a => ({ value: a.id, label: a.name }))

  return (
    <Modal isOpen size="lg" onClose={onClose} title={transactionId === null ? 'New Transaction' : (transaction?.payee ?? 'Transaction')}>
      {loading && <StatusMessage loading />}
      {error && <StatusMessage error={error} />}
      {!loading && !error && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap items-end">
            <Input type="date" value={formData.date ?? ''} onChange={e => setFormData({ ...formData, date: e.target.value })} />
            <Select
              value={formData.accounting_month_offset ?? 0}
              onChange={e => setFormData({ ...formData, accounting_month_offset: parseInt(e.target.value) })}
              className="min-w-[160px]"
            >
              {ACCOUNTING_MONTH_OFFSETS.map(o => (
                <option key={o} value={o}>{accountingMonthLabel(formData.date ?? '', o)}</option>
              ))}
            </Select>
            <Input placeholder="Payee" value={formData.payee ?? ''} onChange={e => setFormData({ ...formData, payee: e.target.value })} />
            <Input placeholder="Memo" value={formData.memo ?? ''} onChange={e => setFormData({ ...formData, memo: e.target.value || null })} />
            <Input placeholder="Amount" type="number" step="0.01" value={formData.amount ?? 0} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} className="w-[110px]" />
            <Select value={formData.account_id ?? 0} onChange={e => setFormData({ ...formData, account_id: parseInt(e.target.value) || 0 })} className="min-w-[140px]">
              <option value={0}>Account</option>
              {acctOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <CategoryPicker
              categories={categories}
              value={formData.category_id ?? null}
              onChange={id => setFormData({ ...formData, category_id: id })}
              className="min-w-[140px]"
            />
          </div>

          <TransactionSplitFields
            rows={split}
            onChange={setSplit}
            amount={formData.amount ?? 0}
            currency={currency}
            allUsers={allUsers}
            account={accounts.find(a => a.id === formData.account_id) ?? null}
            category={categories.find(c => c.id === formData.category_id) ?? null}
            globalWeights={globalWeights}
            source={splitSource}
            onSourceChange={setSplitSource}
          />

          <div className="flex gap-2">
            <Button onClick={save}>Save</Button>
            {transactionId !== null && (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>Delete</Button>
            )}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>

          {transactionId !== null && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">History</h4>
              {historyLoading && <StatusMessage loading />}
              {historyError && <StatusMessage error={historyError} />}
              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <div className="text-xs text-slate-400 py-1">No history recorded for this transaction</div>
              )}
              {!historyLoading && !historyError && historyEntries.length > 0 && (
                <div className="flex flex-col gap-1.5 py-1">
                  {historyEntries.map(h => (
                    <div key={h.id} className="flex items-center gap-2 text-xs flex-wrap">
                      <Badge variant={historyBadgeVariant(h.action)}>
                        {h.action}{h.source === 'csv_import' ? ' · CSV' : ''}
                      </Badge>
                      <span className="text-slate-500 dark:text-slate-400">{new Date(h.changed_at).toLocaleString()}</span>
                      <span className="text-slate-500 dark:text-slate-400">by {h.changed_by_user_name ?? 'Unknown user'}</span>
                      {h.changes && (
                        <span className="text-slate-700 dark:text-slate-200">{describeHistoryChanges(h.changes, allUsers)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {transactionId !== null && (
        <ConfirmDialog
          isOpen={confirmingDelete}
          title="Delete transaction"
          message={`Delete transaction "${transaction?.payee}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </Modal>
  )
}
