import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Transaction, TransactionCreate, TransactionUpdate, TransactionSplit,
  Account, Category, User,
  fetchTransactions, createTransaction, updateTransaction, deleteTransaction,
  fetchAccounts, fetchCategories, fetchUsers, fetchSplitPreview,
} from '../api/client'
import SplitEditor, { SplitRow } from './SplitEditor'
import { useToast } from '../context/ToastContext'
import { Button, Input, Select, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, ConfirmDialog } from './ui'
import { formatMoney } from '../utils/currency'

interface Props {
  onBack: () => void
  selectedUserId: number | null
}

const splitsDisplay = (splits: TransactionSplit[], currency: string) => {
  if (splits.length === 0) return <span className="text-slate-400">—</span>
  return splits.map(s => `${s.user_name} ${formatMoney(s.share_amount, currency)}`).join(' / ')
}

const emptyForm: TransactionCreate = {
  date: new Date().toISOString().slice(0, 10),
  payee: '',
  memo: '',
  amount: 0,
  account_id: 0,
  category_id: 0,
}

export default function TransactionsPage({ onBack, selectedUserId }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<TransactionUpdate>({})
  const [editSplit, setEditSplit] = useState<SplitRow[] | null>(null)
  const [editPreview, setEditPreview] = useState<TransactionSplit[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<TransactionCreate>(emptyForm)
  const [newSplit, setNewSplit] = useState<SplitRow[] | null>(null)
  const [newPreview, setNewPreview] = useState<TransactionSplit[]>([])
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null)
  const { showToast } = useToast()

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      fetchTransactions(selectedUserId ?? undefined),
      fetchAccounts(selectedUserId ?? undefined),
      fetchCategories(),
      fetchUsers(),
    ])
      .then(([txns, accts, cats, users]) => {
        setTransactions(txns)
        setAccounts(accts)
        setCategories(cats)
        setAllUsers(users)
      })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(loadAll, [selectedUserId])

  // Live default-split preview for the "new transaction" form, while no manual override is active.
  useEffect(() => {
    if (!showNew || newSplit !== null || !newData.category_id || !newData.amount) {
      setNewPreview([])
      return
    }
    fetchSplitPreview(newData.amount, newData.category_id)
      .then(setNewPreview)
      .catch(() => setNewPreview([]))
  }, [showNew, newSplit, newData.amount, newData.category_id])

  // Live default-split preview for the "edit transaction" form, while no manual override is active.
  useEffect(() => {
    if (editingId === null || editSplit !== null || !editData.category_id || !editData.amount) {
      setEditPreview([])
      return
    }
    fetchSplitPreview(editData.amount, editData.category_id)
      .then(setEditPreview)
      .catch(() => setEditPreview([]))
  }, [editingId, editSplit, editData.amount, editData.category_id])

  const startEdit = (t: Transaction) => {
    setEditingId(t.id)
    setEditData({
      date: t.date,
      payee: t.payee,
      memo: t.memo,
      amount: t.amount,
      account_id: t.account_id,
      category_id: t.category_id,
    })
    const isManual = t.splits.length > 0 && t.splits.every(s => s.source === 'manual')
    setEditSplit(isManual ? t.splits.map(s => ({ user_id: s.user_id, value: s.share_amount })) : null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
    setEditSplit(null)
  }

  const saveEdit = (id: number) => {
    const amount = editData.amount ?? 0
    if (editSplit !== null) {
      const total = editSplit.reduce((s, r) => s + r.value, 0)
      if (Math.abs(total - amount) > 0.01) {
        showToast(`Custom split must sum to the transaction amount (${amount})`); return
      }
    }
    updateTransaction(id, {
      ...editData,
      split_overrides: editSplit ? editSplit.map(r => ({ user_id: r.user_id, share_amount: r.value })) : null,
    })
      .then(() => { cancelEdit(); loadAll() })
      .catch(err => showToast(err.message))
  }

  const confirmDelete = () => {
    if (!deletingTransaction) return
    deleteTransaction(deletingTransaction.id)
      .then(() => loadAll())
      .catch(err => showToast(err.message))
      .finally(() => setDeletingTransaction(null))
  }

  const saveNew = () => {
    if (!newData.payee || !newData.account_id || !newData.category_id) {
      showToast('Payee, account, and category are required'); return
    }
    if (newSplit !== null) {
      const total = newSplit.reduce((s, r) => s + r.value, 0)
      if (Math.abs(total - newData.amount) > 0.01) {
        showToast(`Custom split must sum to the transaction amount (${newData.amount})`); return
      }
    }
    createTransaction({
      ...newData,
      split_overrides: newSplit ? newSplit.map(r => ({ user_id: r.user_id, share_amount: r.value })) : undefined,
    })
      .then(() => { setShowNew(false); setNewData(emptyForm); setNewSplit(null); loadAll() })
      .catch(err => showToast(err.message))
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewData(emptyForm)
    setNewSplit(null)
  }

  const toggleCustomSplit = (
    active: boolean,
    preview: TransactionSplit[],
    setSplit: (s: SplitRow[] | null) => void,
  ) => {
    if (active) {
      setSplit(preview.map(p => ({ user_id: p.user_id, value: p.share_amount })))
    } else {
      setSplit(null)
    }
  }

  const renderSplitSection = (
    amount: number,
    currency: string,
    split: SplitRow[] | null,
    preview: TransactionSplit[],
    setSplit: (s: SplitRow[] | null) => void,
  ) => (
    <div className="mt-2">
      <label className="text-xs flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={split !== null}
          onChange={e => toggleCustomSplit(e.target.checked, preview, setSplit)}
        />
        Customize split
      </label>
      {split !== null ? (
        <SplitEditor rows={split} allUsers={allUsers} total={amount} unit="currency" currency={currency} label="Split" onChange={setSplit} />
      ) : (
        preview.length > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Default split: {preview.map(p => `${p.user_name} ${formatMoney(p.share_amount, currency)}`).join(' / ')}
          </div>
        )
      )}
    </div>
  )

  const currencyFor = (accountId: number | undefined) =>
    accounts.find(a => a.id === accountId)?.currency ?? 'EUR'

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  const hasMemo = sorted.some(t => t.memo !== null)

  const acctOptions = accounts.map(a => ({ value: a.id, label: a.name }))
  const catOptions = categories.map(c => ({ value: c.id, label: `${c.name} (${c.type})` }))

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-accent hover:underline text-sm mb-4 cursor-pointer">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transactions</h2>
        <Button onClick={() => setShowNew(true)}>+ New Transaction</Button>
      </div>

      {showNew && (
        <div className="p-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex gap-2 flex-wrap items-end">
            <Input type="date" value={newData.date} onChange={e => setNewData({ ...newData, date: e.target.value })} />
            <Input placeholder="Payee" value={newData.payee} onChange={e => setNewData({ ...newData, payee: e.target.value })} />
            <Input placeholder="Memo" value={newData.memo ?? ''} onChange={e => setNewData({ ...newData, memo: e.target.value || null })} />
            <Input placeholder="Amount" type="number" step="0.01" value={newData.amount} onChange={e => setNewData({ ...newData, amount: parseFloat(e.target.value) || 0 })} className="w-[110px]" />
            <Select value={newData.account_id} onChange={e => setNewData({ ...newData, account_id: parseInt(e.target.value) || 0 })} className="min-w-[140px]">
              <option value={0}>Account</option>
              {acctOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select value={newData.category_id} onChange={e => setNewData({ ...newData, category_id: parseInt(e.target.value) || 0 })} className="min-w-[140px]">
              <option value={0}>Category</option>
              {catOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Button onClick={saveNew}>Save</Button>
            <Button variant="secondary" onClick={cancelNew}>Cancel</Button>
          </div>
          {renderSplitSection(newData.amount, currencyFor(newData.account_id), newSplit, newPreview, setNewSplit)}
        </div>
      )}

      <StatusMessage loading={loading} />

      {!loading && (
        <Table>
          <Thead>
            <Tr>
              <Th>Date</Th>
              <Th>Payee</Th>
              <Th>Category</Th>
              <Th>Account</Th>
              {hasMemo && <Th>Memo</Th>}
              <Th className="text-right">Amount</Th>
              <Th>Split</Th>
              <Th className="text-center">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sorted.length === 0 && (
              <Tr><Td colSpan={hasMemo ? 8 : 7} className="text-center py-5 text-slate-400">No transactions yet</Td></Tr>
            )}
            {sorted.map(t => (
              <Tr key={t.id}>
                {editingId === t.id ? (
                  <>
                    <Td><Input type="date" value={editData.date ?? ''} onChange={e => setEditData({ ...editData, date: e.target.value })} /></Td>
                    <Td><Input value={editData.payee ?? ''} onChange={e => setEditData({ ...editData, payee: e.target.value })} /></Td>
                    <Td>
                      <Select value={editData.category_id ?? 0} onChange={e => setEditData({ ...editData, category_id: parseInt(e.target.value) || 0 })} className="min-w-[140px]">
                        <option value={0}>Category</option>
                        {catOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Td>
                    <Td>
                      <Select value={editData.account_id ?? 0} onChange={e => setEditData({ ...editData, account_id: parseInt(e.target.value) || 0 })} className="min-w-[140px]">
                        <option value={0}>Account</option>
                        {acctOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Td>
                    {hasMemo && (
                      <Td><Input value={editData.memo ?? ''} onChange={e => setEditData({ ...editData, memo: e.target.value || null })} /></Td>
                    )}
                    <Td className="text-right">
                      <Input type="number" step="0.01" value={editData.amount ?? 0} onChange={e => setEditData({ ...editData, amount: parseFloat(e.target.value) || 0 })} className="w-[110px] text-right" />
                    </Td>
                    <Td colSpan={2}>
                      {renderSplitSection(editData.amount ?? 0, currencyFor(editData.account_id), editSplit, editPreview, setEditSplit)}
                      <div className="mt-1.5 flex gap-1">
                        <Button size="sm" onClick={() => saveEdit(t.id)}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                      </div>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td>{t.date}</Td>
                    <Td>{t.payee}</Td>
                    <Td>{t.category_name}</Td>
                    <Td>{t.account_name}</Td>
                    {hasMemo && <Td>{t.memo ?? ''}</Td>}
                    <Td className={`text-right ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatMoney(t.amount, t.currency)}
                    </Td>
                    <Td className="text-xs">{splitsDisplay(t.splits, t.currency)}</Td>
                    <Td className="text-center">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(t)} className="mr-1">Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setDeletingTransaction(t)}>Delete</Button>
                    </Td>
                  </>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <ConfirmDialog
        isOpen={deletingTransaction !== null}
        title="Delete transaction"
        message={`Delete transaction "${deletingTransaction?.payee}"?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingTransaction(null)}
      />
    </div>
  )
}
