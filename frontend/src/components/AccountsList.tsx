import { Fragment, ReactNode, useState } from 'react'
import { Archive, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Account, AccountCreate, AccountUpdate, AccountUserCreate, AccountSplitWeightCreate,
  User, fetchAccounts, createAccount, updateAccount, deleteAccount,
  fetchUsers, updateAccountSplitWeights,
} from '../api/client'
import SplitEditor, { SplitRow } from './SplitEditor'
import { useToast } from '../context/ToastContext'
import { useCrudList } from '../hooks/useCrudList'
import { Button, Input, Select, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, ConfirmDialog, BackButton } from './ui'
import { CURRENCY_OPTIONS, formatMoney } from '../utils/currency'
import { AccountTypeGroup, groupAccounts } from '../utils/accountGroups'
import { useIsMobile } from '../hooks/useMediaQuery'

const ARCHIVED_KEY = 'archived'
const groupKey = (g: AccountTypeGroup) => `type:${g.key}`

const toRows = (users: AccountUserCreate[]): SplitRow[] =>
  users.map(u => ({ user_id: u.user_id, value: u.ownership_percentage }))

const fromRows = (rows: SplitRow[]): AccountUserCreate[] =>
  rows.map(r => ({ user_id: r.user_id, ownership_percentage: r.value }))

const toWeightRows = (weights: AccountSplitWeightCreate[]): SplitRow[] =>
  weights.map(w => ({ user_id: w.user_id, value: w.weight }))

const fromWeightRows = (rows: SplitRow[]): AccountSplitWeightCreate[] =>
  rows.map(r => ({ user_id: r.user_id, weight: r.value }))

const validateOwners = (users: AccountUserCreate[]): string | null => {
  if (users.length === 0) return null
  if (users.some(u => !u.user_id)) return 'Select a user for every owner row'
  const total = users.reduce((s, u) => s + u.ownership_percentage, 0)
  if (Math.abs(total - 100) > 0.01) return 'Ownership percentages must sum to 100'
  return null
}

const validateSplitWeights = (weights: AccountSplitWeightCreate[]): string | null => {
  if (weights.length === 0) return null
  if (weights.some(w => !w.user_id)) return 'Select a user for every split weight row'
  if (weights.some(w => w.weight < 0)) return 'Split weights must be >= 0'
  if (weights.every(w => w.weight === 0)) return 'At least one split weight must be greater than 0'
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
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [editSplitWeights, setEditSplitWeights] = useState<SplitRow[]>([])
  const [newSplitWeights, setNewSplitWeights] = useState<SplitRow[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const isMobile = useIsMobile()
  const { showToast } = useToast()

  const {
    items: accounts, loading, error, load,
    editingId, editData, setEditData, startEdit: startEditHook, cancelEdit: cancelEditHook,
    showNew, setShowNew, newData, setNewData, cancelNew: cancelNewHook,
    deletingItem: deletingAccount, setDeletingItem: setDeletingAccount, confirmDelete,
  } = useCrudList<Account, AccountCreate, AccountUpdate>({
    fetchAll: () => Promise.all([fetchAccounts(selectedUserId ?? undefined), fetchUsers()]).then(([accts, users]) => { setAllUsers(users); return accts }),
    create: createAccount,
    update: updateAccount,
    remove: deleteAccount,
    getId: a => a.id,
    emptyForm,
    toEditData: a => ({
      name: a.name,
      type: a.type,
      balance: a.balance,
      currency: a.currency,
      users: a.users.map(u => ({ user_id: u.user_id, ownership_percentage: u.ownership_percentage })),
    }),
    deps: [selectedUserId],
  })

  // Split-weight tier isn't part of AccountUpdate/AccountCreate — it's saved via
  // its own endpoint (updateAccountSplitWeights), so it's kept as separate state
  // synced alongside the hook's editData/newData rather than folded into either.
  const startEdit = (a: Account) => {
    startEditHook(a)
    setEditSplitWeights(toWeightRows(a.split_weights.map(w => ({ user_id: w.user_id, weight: w.weight }))))
  }

  const cancelEdit = () => {
    cancelEditHook()
    setEditSplitWeights([])
  }

  const cancelNew = () => {
    cancelNewHook()
    setNewSplitWeights([])
  }

  const saveEdit = (id: number) => {
    const err = validateOwners(editData.users ?? [])
    if (err) { showToast(err); return }
    const weightsErr = validateSplitWeights(fromWeightRows(editSplitWeights))
    if (weightsErr) { showToast(weightsErr); return }
    updateAccount(id, editData)
      .then(() => {
        updateAccountSplitWeights(id, fromWeightRows(editSplitWeights))
          .then(() => { cancelEdit(); load() })
          .catch(weightsErr => {
            showToast(`Account details were saved, but its split weights failed to save: ${weightsErr.message}`)
            load()
          })
      })
      .catch(err => showToast(err.message))
  }

  const saveNew = () => {
    if (!newData.name || !newData.type) { showToast('Name and type are required'); return }
    const err = validateOwners(newData.users ?? [])
    if (err) { showToast(err); return }
    const splitWeights = fromWeightRows(newSplitWeights)
    const weightsErr = validateSplitWeights(splitWeights)
    if (weightsErr) { showToast(weightsErr); return }
    createAccount(newData)
      .then(created => {
        updateAccountSplitWeights(created.id, splitWeights)
          .then(() => { cancelNew(); load() })
          .catch(weightsErr => {
            showToast(`Account "${created.name}" was created, but its split weights failed to save: ${weightsErr.message}`)
            load()
          })
      })
      .catch(err => showToast(err.message))
  }

  const ownersDisplay = (a: Account) => {
    if (a.users.length === 0) return <span className="text-slate-400">—</span>
    return a.users.map(u => `${u.user_name} (${u.ownership_percentage}%)`).join(', ')
  }

  // The account's own split-weight tier, with each person's resulting share. An
  // account without one falls back to the category, then global, tiers.
  const splitWeightsDisplay = (a: Account) => {
    const total = a.split_weights.reduce((s, w) => s + w.weight, 0)
    if (a.split_weights.length === 0 || total === 0) {
      return <span className="text-slate-400" title="No account weights: category or global weights apply">Default</span>
    }
    return (
      <span className="flex flex-wrap gap-1">
        {a.split_weights.map(w => (
          <span
            key={w.user_id}
            className="whitespace-nowrap rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5"
            title={`Weight ${w.weight} of ${total}`}
          >
            {w.user_name} <span className="font-semibold">{w.weight}</span>
            <span className="text-slate-400"> · {Math.round((w.weight / total) * 100)}%</span>
          </span>
        ))}
      </span>
    )
  }

  const toggleArchived = (a: Account) => {
    updateAccount(a.id, { archived: !a.archived }).then(load).catch(err => showToast(err.message))
  }

  const toggleGroup = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const groups = groupAccounts(accounts)
  const archivedCount = groups.archived.reduce((n, g) => n + g.accounts.length, 0)
  const isEmpty = groups.open.length === 0 && (!showArchived || archivedCount === 0)

  const groupHeaderContent = (key: string, label: ReactNode, count: number, icon?: ReactNode) => (
    <button
      type="button"
      aria-expanded={!collapsed.has(key)}
      onClick={() => toggleGroup(key)}
      className="flex w-full items-center gap-1.5 text-left font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
    >
      <span className="text-slate-400">{collapsed.has(key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
      {icon}
      <span>{label}</span>
      <span className="text-xs font-normal text-slate-400">{count}</span>
    </button>
  )

  const actionButtons = (a: Account) => (
    <>
      <Button size="sm" variant="secondary" onClick={() => startEdit(a)}>Edit</Button>
      <Button size="sm" variant="secondary" onClick={() => toggleArchived(a)}>
        {a.archived ? 'Unarchive' : 'Archive'}
      </Button>
      <Button size="sm" variant="danger" onClick={() => setDeletingAccount(a)}>Delete</Button>
    </>
  )

  const splitEditors = (
    <>
      <SplitEditor
        rows={toRows(editData.users ?? [])}
        allUsers={allUsers}
        total={100}
        unit="%"
        label="Owners"
        onChange={rows => setEditData({ ...editData, users: fromRows(rows) })}
      />
      <SplitEditor
        rows={editSplitWeights}
        allUsers={allUsers}
        unit="weight"
        label="Split Weight (optional — prefills new transactions on this account; separate from ownership)"
        onChange={setEditSplitWeights}
      />
    </>
  )

  const saveCancel = (a: Account) => (
    <div className="mt-1.5 flex gap-1">
      <Button size="sm" onClick={() => saveEdit(a.id)}>Save</Button>
      <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
    </div>
  )

  // --- Desktop: one table, a header row per type, archived types under one header ---

  const tableRow = (a: Account) => (
    <Tr key={a.id}>
      {editingId === a.id ? (
        <>
          <Td>
            <div className="flex flex-col gap-1">
              <Input aria-label="Name" value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} />
              <Input aria-label="Type" placeholder="Type" value={editData.type ?? ''} onChange={e => setEditData({ ...editData, type: e.target.value })} />
            </div>
          </Td>
          <Td className="text-right"><Input type="number" value={editData.balance ?? 0} onChange={e => setEditData({ ...editData, balance: parseFloat(e.target.value) || 0 })} className="w-[100px] text-right" /></Td>
          <Td><CurrencyField value={editData.currency ?? 'EUR'} onChange={currency => setEditData({ ...editData, currency })} /></Td>
          <Td colSpan={3}>
            {splitEditors}
            {saveCancel(a)}
          </Td>
        </>
      ) : (
        <>
          <Td className="pl-8">{a.name}</Td>
          <Td className={`text-right whitespace-nowrap ${a.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatMoney(a.balance, a.currency)}
          </Td>
          <Td>{a.currency}</Td>
          <Td className="text-xs">{ownersDisplay(a)}</Td>
          <Td className="text-xs">{splitWeightsDisplay(a)}</Td>
          <Td className="text-center whitespace-nowrap">
            <div className="inline-flex gap-1">{actionButtons(a)}</div>
          </Td>
        </>
      )}
    </Tr>
  )

  const headerRow = (key: string, content: ReactNode) => (
    <Tr key={key} className="bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/80">
      <Td colSpan={6} className="py-1.5">{content}</Td>
    </Tr>
  )

  const table = (
    <Table>
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th className="text-right">Balance</Th>
          <Th>Currency</Th>
          <Th>Owners</Th>
          <Th>Split weights</Th>
          <Th className="text-center">Actions</Th>
        </Tr>
      </Thead>
      <Tbody>
        {isEmpty && (
          <Tr><Td colSpan={6} className="text-center py-5 text-slate-400">No accounts yet</Td></Tr>
        )}
        {groups.open.map(g => (
          <Fragment key={g.key}>
            {headerRow(groupKey(g), groupHeaderContent(groupKey(g), g.label, g.accounts.length))}
            {!collapsed.has(groupKey(g)) && g.accounts.map(tableRow)}
          </Fragment>
        ))}
        {showArchived && archivedCount > 0 && (
          <>
            {headerRow(ARCHIVED_KEY, groupHeaderContent(ARCHIVED_KEY, 'Archived', archivedCount, <Archive size={13} className="text-slate-400" />))}
            {!collapsed.has(ARCHIVED_KEY) && groups.archived.map(g => (
              <Fragment key={g.key}>
                <Tr className="hover:bg-transparent dark:hover:bg-transparent">
                  <Td colSpan={6} role="separator" className="pl-8 pt-2 pb-0.5 text-[11px] uppercase tracking-wide text-slate-400">{g.label}</Td>
                </Tr>
                {g.accounts.map(tableRow)}
              </Fragment>
            ))}
          </>
        )}
      </Tbody>
    </Table>
  )

  // --- Mobile: the same groups as stacked cards ---

  const card = (a: Account) => (
    <div key={a.id} data-testid="account-card" className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      {editingId === a.id ? (
        <div className="flex flex-col gap-2">
          <Input aria-label="Name" value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} />
          <Input aria-label="Type" placeholder="Type" value={editData.type ?? ''} onChange={e => setEditData({ ...editData, type: e.target.value })} />
          <div className="flex gap-2 items-center">
            <Input aria-label="Balance" type="number" value={editData.balance ?? 0} onChange={e => setEditData({ ...editData, balance: parseFloat(e.target.value) || 0 })} className="w-[120px]" />
            <CurrencyField value={editData.currency ?? 'EUR'} onChange={currency => setEditData({ ...editData, currency })} />
          </div>
          {splitEditors}
          {saveCancel(a)}
        </div>
      ) : (
        <>
          <div className="flex justify-between items-baseline gap-2">
            <span className="font-medium text-slate-900 dark:text-slate-100">{a.name}</span>
            <span className={`whitespace-nowrap font-medium ${a.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatMoney(a.balance, a.currency)}
            </span>
          </div>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <dt className="text-slate-400">Owners</dt>
            <dd>{ownersDisplay(a)}</dd>
            <dt className="text-slate-400">Split</dt>
            <dd>{splitWeightsDisplay(a)}</dd>
          </dl>
          <div className="mt-2 flex justify-end gap-1">{actionButtons(a)}</div>
        </>
      )}
    </div>
  )

  const cards = (
    <div className="flex flex-col gap-3">
      {isEmpty && <p className="text-center py-5 text-slate-400">No accounts yet</p>}
      {groups.open.map(g => (
        <section key={g.key}>
          <div className="px-1 py-1">{groupHeaderContent(groupKey(g), g.label, g.accounts.length)}</div>
          {!collapsed.has(groupKey(g)) && <div className="flex flex-col gap-2">{g.accounts.map(card)}</div>}
        </section>
      ))}
      {showArchived && archivedCount > 0 && (
        <section className="pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="px-1 py-1">{groupHeaderContent(ARCHIVED_KEY, 'Archived', archivedCount, <Archive size={13} className="text-slate-400" />)}</div>
          {!collapsed.has(ARCHIVED_KEY) && groups.archived.map(g => (
            <div key={g.key}>
              <div role="separator" className="px-1 pt-2 pb-1 text-[11px] uppercase tracking-wide text-slate-400">{g.label}</div>
              <div className="flex flex-col gap-2">{g.accounts.map(card)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  )

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Accounts</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <Button onClick={() => setShowNew(true)}>+ New Account</Button>
        </div>
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
          <SplitEditor
            rows={newSplitWeights}
            allUsers={allUsers}
            unit="weight"
            label="Split Weight (optional — prefills new transactions on this account; separate from ownership)"
            onChange={setNewSplitWeights}
          />
        </div>
      )}

      <StatusMessage loading={loading} />

      {!loading && (isMobile ? cards : table)}

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
