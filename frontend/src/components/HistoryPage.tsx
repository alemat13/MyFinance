import { Fragment, useEffect, useState } from 'react'
import {
  Account, Category, HistoryEntry, HistoryGroupRef, TransactionHistoryEntry, User,
  fetchAccounts, fetchCategories, fetchHistory, fetchHistoryRows, fetchUsers, historyGroupRef,
} from '../api/client'
import { BackButton, Badge, Button, Card, Select, StatusMessage } from './ui'
import { formatServerDay, formatServerTimestamp } from '../utils/datetime'
import { formatMoney } from '../utils/currency'
import {
  historyBadgeLabel, historyBadgeVariant, describeHistoryChanges, describeGroupChanges,
} from '../utils/history'

interface Props {
  onBack: () => void
  // Opens one transaction's detail on the Transactions screen.
  onOpenTransaction: (id: number) => void
  // Opens the Transactions screen on exactly the transactions an entry touched.
  onOpenGroup: (group: HistoryGroupRef) => void
}

const PAGE_SIZE = 50
const ROWS_PAGE_SIZE = 50

const ORIGINS: [string, string][] = [
  ['', 'All origins'],
  ['manual', 'By hand'],
  ['bulk', 'Bulk edit'],
  ['rule', 'Rules'],
  ['categorizer', 'Auto-categorization'],
  ['csv_import', 'Import'],
  ['bank_sync', 'Bank sync'],
  ['divide', 'Divide'],
  ['link', 'Links'],
  ['checkpoint', 'Checkpoints'],
  ['admin', 'Admin'],
]

const ACTIONS: [string, string][] = [
  ['', 'All changes'],
  ['created', 'Created'],
  ['updated', 'Updated'],
  ['deleted', 'Deleted'],
]

function Snapshot({ date, payee, amount, accountId, accounts }: {
  date: string | null; payee: string | null; amount: number | null; accountId: number | null; accounts: Account[]
}) {
  const account = accounts.find(a => a.id === accountId)
  return (
    <span className="text-slate-700 dark:text-slate-200">
      {[date, payee, amount !== null ? formatMoney(amount, account?.currency ?? 'EUR') : null, account?.name]
        .filter(Boolean).join(' · ')}
    </span>
  )
}

/** The rows behind one group, loaded on demand, 50 at a time. */
function GroupRows({ group, accounts, categories, users, onOpenTransaction }: {
  group: HistoryEntry; accounts: Account[]; categories: Category[]; users: User[]
  onOpenTransaction: (id: number) => void
}) {
  const [rows, setRows] = useState<TransactionHistoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (offset: number) => {
    setLoading(true)
    fetchHistoryRows(historyGroupRef(group), offset, ROWS_PAGE_SIZE)
      .then(res => { setRows(current => (offset === 0 ? res.items : [...current, ...res.items])); setTotal(res.total) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => load(0), [group.first_id, group.last_id])

  return (
    <div className="mt-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-1.5">
      {rows.map(r => (
        <div key={r.id} className="text-xs flex flex-wrap gap-x-2">
          {r.action !== 'deleted' ? (
            <button type="button" className="text-accent hover:underline text-left" onClick={() => onOpenTransaction(r.transaction_id)}>
              <Snapshot date={r.date} payee={r.payee} amount={r.amount} accountId={r.account_id} accounts={accounts} />
            </button>
          ) : (
            <Snapshot date={r.date} payee={r.payee} amount={r.amount} accountId={r.account_id} accounts={accounts} />
          )}
          {r.changes && r.action === 'updated' && (
            <span className="text-slate-500 dark:text-slate-400">{describeHistoryChanges(r.changes, users, categories)}</span>
          )}
        </div>
      ))}
      {loading && <StatusMessage loading />}
      {error && <StatusMessage error={error} />}
      {!loading && rows.length < total && (
        <Button size="sm" variant="secondary" onClick={() => load(rows.length)}>
          Show more ({total - rows.length} left)
        </Button>
      )}
    </div>
  )
}

/** Every change made to every transaction, newest first. The rows one action
 *  wrote (a bulk edit, an import, a sync) are one line, which can be opened
 *  to list them or to work on them from the Transactions screen. */
export default function HistoryPage({ onBack, onOpenTransaction, onOpenGroup }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [action, setAction] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    Promise.all([fetchAccounts(), fetchCategories(), fetchUsers()])
      .then(([accts, cats, us]) => { setAccounts(accts); setCategories(cats); setUsers(us) })
      .catch(() => { /* names fall back to ids */ })
  }, [])

  const load = (beforeId: number | null) => {
    setLoading(true)
    setError(null)
    fetchHistory({ beforeId, limit: PAGE_SIZE, action: action || undefined, source: origin || undefined })
      .then(page => {
        setEntries(current => (beforeId === null ? page.items : [...current, ...page.items]))
        setNextBeforeId(page.next_before_id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { setExpanded(new Set()); load(null) }, [origin, action])

  const toggle = (id: number) => setExpanded(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">History</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
        Every change made to a transaction, newest first. A bulk edit, an import or a bank sync shows as one line
        for all the transactions it changed.
      </p>

      <div className="flex gap-2 flex-wrap mb-3">
        <Select aria-label="Origin" value={origin} onChange={e => setOrigin(e.target.value)} className="min-w-[160px]">
          {ORIGINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select aria-label="Change" value={action} onChange={e => setAction(e.target.value)} className="min-w-[140px]">
          {ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>

      {error && <StatusMessage error={error} />}
      {!loading && !error && entries.length === 0 && (
        <Card className="p-3 text-sm text-slate-500 dark:text-slate-400">No change recorded.</Card>
      )}

      <div className="space-y-2">
        {entries.map((entry, idx) => {
          const showDay = idx === 0 || formatServerDay(entries[idx - 1].changed_at) !== formatServerDay(entry.changed_at)
          const isGroup = entry.count > 1
          return (
            <Fragment key={entry.first_id}>
              {showDay && (
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 pt-2">{formatServerDay(entry.changed_at)}</div>
              )}
              <Card className="p-3 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={historyBadgeVariant(entry.action)}>{historyBadgeLabel(entry.action, entry.source)}</Badge>
                  {isGroup && (
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{entry.count} transactions</span>
                  )}
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatServerTimestamp(entry.changed_at)}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">by {entry.changed_by_user_name ?? 'Unknown user'}</span>
                </div>
                {!isGroup && (
                  <div className="mt-1 text-xs flex flex-wrap gap-x-2">
                    {entry.action !== 'deleted' && entry.transaction_id !== null ? (
                      <button type="button" className="text-accent hover:underline text-left"
                              onClick={() => onOpenTransaction(entry.transaction_id!)}>
                        <Snapshot date={entry.date} payee={entry.payee} amount={entry.amount} accountId={entry.account_id} accounts={accounts} />
                      </button>
                    ) : (
                      <Snapshot date={entry.date} payee={entry.payee} amount={entry.amount} accountId={entry.account_id} accounts={accounts} />
                    )}
                    {entry.changes && entry.action === 'updated' && (
                      <span className="text-slate-500 dark:text-slate-400">
                        {describeHistoryChanges(entry.changes as TransactionHistoryEntry['changes'], users, categories)}
                      </span>
                    )}
                  </div>
                )}
                {isGroup && (
                  <>
                    {entry.changes && entry.action === 'updated' && (
                      <div className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        {describeGroupChanges(entry.changes, users, categories)}
                      </div>
                    )}
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" onClick={() => toggle(entry.first_id)}>
                        {expanded.has(entry.first_id) ? 'Hide transactions' : 'Show transactions'}
                      </Button>
                      {entry.action !== 'deleted' && (
                        <Button size="sm" variant="secondary" onClick={() => onOpenGroup(historyGroupRef(entry))}>
                          Open in Transactions
                        </Button>
                      )}
                    </div>
                    {expanded.has(entry.first_id) && (
                      <GroupRows group={entry} accounts={accounts} categories={categories} users={users}
                                 onOpenTransaction={onOpenTransaction} />
                    )}
                  </>
                )}
              </Card>
            </Fragment>
          )
        })}
      </div>

      {loading && <StatusMessage loading />}
      {!loading && nextBeforeId !== null && (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => load(nextBeforeId)}>Show older changes</Button>
        </div>
      )}
    </div>
  )
}
