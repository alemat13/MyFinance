import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Account, AccountCreate, AccountUpdate, AccountUserCreate,
  User, fetchAccounts, createAccount, updateAccount, deleteAccount,
  fetchUsers,
} from '../api/client'
import SplitEditor, { SplitRow } from './SplitEditor'
import { useToast } from '../context/ToastContext'
import { Button, Input, Select, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, ConfirmDialog } from './ui'
import { CURRENCY_OPTIONS, formatMoney } from '../utils/currency'

const toRows = (users: AccountUserCreate[]): SplitRow[] =>
  users.map(u => ({ user_id: u.user_id, value: u.ownership_percentage }))

const fromRows = (rows: SplitRow[]): AccountUserCreate[] =>
  rows.map(r => ({ user_id: r.user_id, ownership_percentage: r.value }))

const validateOwners = (users: AccountUserCreate[]): string | null => {
  if (users.length === 0) return null
  if (users.some(u => !u.user_id)) return 'Select a user for every owner row'
  const total = users.reduce((s, u) => s + u.ownership_percentage, 0)
  if (Math.abs(total - 100) > 0.01) return 'Ownership percentages must sum to 100'
  return null
}

interface Props {
  onBack: () => void
  selectedUserId: number | null
}

const emptyForm: AccountCreate = { name: '', type: '', balance: 0, currency: 'EUR', users: [] }

interface CurrencyFieldProps {
  value: string
  onChange: (value: string) => void
}

function CurrencyField({ value, onChange }: CurrencyFieldProps) {
  const isCurated = (CURRENCY_OPTIONS as readonly string[]).includes(value)
  return (
    <div className="flex gap-1.5 items-center">
      <Select
        value={isCurated ? value : 'other'}
        onChange={e => onChange(e.target.value === 'other' ? '' : e.target.value)}
        className="w-[90px]"
      >
        {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        <option value="other">Other…</option>
      </Select>
      {!isCurated && (
        <Input
          placeholder="Code"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className="w-[70px]"
          maxLength={3}
        />
      )}
    </div>
  )
}

export default function AccountsList({ onBack, selectedUserId }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<AccountUpdate>({})
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<AccountCreate>(emptyForm)
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null)
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchAccounts(selectedUserId ?? undefined),
      fetchUsers(),
    ])
      .then(([accts, users]) => {
        setAccounts(accts)
        setAllUsers(users)
      })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [selectedUserId])

  const startEdit = (a: Account) => {
    setEditingId(a.id)
    setEditData({
      name: a.name,
      type: a.type,
      balance: a.balance,
      currency: a.currency,
      users: a.users.map(u => ({ user_id: u.user_id, ownership_percentage: u.ownership_percentage })),
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = (id: number) => {
    const err = validateOwners(editData.users ?? [])
    if (err) { showToast(err); return }
    updateAccount(id, editData)
      .then(() => { cancelEdit(); load() })
      .catch(err => showToast(err.message))
  }

  const confirmDelete = () => {
    if (!deletingAccount) return
    deleteAccount(deletingAccount.id)
      .then(() => load())
      .catch(err => showToast(err.message))
      .finally(() => setDeletingAccount(null))
  }

  const saveNew = () => {
    if (!newData.name || !newData.type) { showToast('Name and type are required'); return }
    const err = validateOwners(newData.users ?? [])
    if (err) { showToast(err); return }
    createAccount(newData)
      .then(() => { setShowNew(false); setNewData(emptyForm); load() })
      .catch(err => showToast(err.message))
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewData(emptyForm)
  }

  const ownersDisplay = (a: Account) => {
    if (a.users.length === 0) return <span className="text-slate-400">—</span>
    return a.users.map(u => `${u.user_name} (${u.ownership_percentage}%)`).join(', ')
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-accent hover:underline text-sm mb-4 cursor-pointer">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Accounts</h2>
        <Button onClick={() => setShowNew(true)}>+ New Account</Button>
      </div>

      {showNew && (
        <div className="p-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex gap-2 flex-wrap items-end">
            <Input placeholder="Name" value={newData.name} onChange={e => setNewData({ ...newData, name: e.target.value })} />
            <Input placeholder="Type" value={newData.type} onChange={e => setNewData({ ...newData, type: e.target.value })} />
            <Input placeholder="Balance" type="number" value={newData.balance} onChange={e => setNewData({ ...newData, balance: parseFloat(e.target.value) || 0 })} className="w-[100px]" />
            <CurrencyField value={newData.currency ?? 'EUR'} onChange={currency => setNewData({ ...newData, currency })} />
            <Button onClick={saveNew}>Save</Button>
            <Button variant="secondary" onClick={cancelNew}>Cancel</Button>
          </div>
          <SplitEditor
            rows={toRows(newData.users ?? [])}
            allUsers={allUsers}
            total={100}
            unit="%"
            label="Owners"
            onChange={rows => setNewData({ ...newData, users: fromRows(rows) })}
          />
        </div>
      )}

      <StatusMessage loading={loading} />

      {!loading && (
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th className="text-right">Balance</Th>
              <Th>Currency</Th>
              <Th>Owners</Th>
              <Th className="text-center">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {accounts.length === 0 && (
              <Tr><Td colSpan={6} className="text-center py-5 text-slate-400">No accounts yet</Td></Tr>
            )}
            {accounts.map(a => (
              <Tr key={a.id}>
                {editingId === a.id ? (
                  <>
                    <Td><Input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} /></Td>
                    <Td><Input value={editData.type ?? ''} onChange={e => setEditData({ ...editData, type: e.target.value })} /></Td>
                    <Td className="text-right"><Input type="number" value={editData.balance ?? 0} onChange={e => setEditData({ ...editData, balance: parseFloat(e.target.value) || 0 })} className="w-[100px] text-right" /></Td>
                    <Td><CurrencyField value={editData.currency ?? 'EUR'} onChange={currency => setEditData({ ...editData, currency })} /></Td>
                    <Td colSpan={2}>
                      <SplitEditor
                        rows={toRows(editData.users ?? [])}
                        allUsers={allUsers}
                        total={100}
                        unit="%"
                        label="Owners"
                        onChange={rows => setEditData({ ...editData, users: fromRows(rows) })}
                      />
                      <div className="mt-1.5 flex gap-1">
                        <Button size="sm" onClick={() => saveEdit(a.id)}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                      </div>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td>{a.name}</Td>
                    <Td>{a.type}</Td>
                    <Td className={`text-right ${a.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatMoney(a.balance, a.currency)}
                    </Td>
                    <Td>{a.currency}</Td>
                    <Td className="text-xs">{ownersDisplay(a)}</Td>
                    <Td className="text-center">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(a)} className="mr-1">Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setDeletingAccount(a)}>Delete</Button>
                    </Td>
                  </>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <ConfirmDialog
        isOpen={deletingAccount !== null}
        title="Delete account"
        message={`Delete account "${deletingAccount?.name}"?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingAccount(null)}
      />
    </div>
  )
}
