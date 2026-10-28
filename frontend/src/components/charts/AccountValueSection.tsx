import { useEffect, useState } from 'react'
import { Account, AccountValue, fetchAccounts, fetchAccountValue } from '../../api/client'
import { Card, StatusMessage } from '../ui'
import AccountPicker from '../AccountPicker'
import AccountValueChart, { PAID_IN_COLOR, VALUE_COLOR } from './AccountValueChart'

interface Props {
  userId: number
}

const storageKey = (userId: number) => `chartsValueAccountIds:${userId}`

function loadIds(userId: number): number[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : []
  } catch {
    return []
  }
}

function saveIds(userId: number, ids: number[]) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(ids)) } catch { /* storage unavailable */ }
}

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Value per account" at the bottom of Charts: one value-vs-paid-in chart per
 *  account the user picks, the pick remembered per user on this device. Only
 *  accounts the user owns a part of are offered, each scaled to that part. */
export default function AccountValueSection({ userId }: Props) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>(() => loadIds(userId))
  const [series, setSeries] = useState<AccountValue[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedIds(loadIds(userId))
    fetchAccounts()
      .then(setAccounts)
      .catch(err => { console.error(err); setError(err.message) })
  }, [userId])

  const percentageOf = (account: Account) =>
    account.users?.find(u => u.user_id === userId)?.ownership_percentage ?? 0
  const owned = (accounts ?? []).filter(a => percentageOf(a) > 0)
  const ownedIds = new Set(owned.map(a => a.id))
  const shownIds = selectedIds.filter(id => ownedIds.has(id))
  const shownKey = shownIds.join(',')

  useEffect(() => {
    if (shownIds.length === 0) { setSeries([]); return }
    fetchAccountValue(shownIds)
      .then(setSeries)
      .catch(err => { console.error(err); setError(err.message) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey])

  const change = (ids: number[]) => {
    setSelectedIds(ids)
    saveIds(userId, ids)
  }

  const today = localToday()
  const byId = new Map(owned.map(a => [a.id, a]))

  return (
    <section aria-label="Value per account">
      <Card className="p-4 mb-3">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">Value per account</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          <span style={{ color: VALUE_COLOR }}>■</span> value, set by the account's checkpoints ·{' '}
          <span style={{ color: PAID_IN_COLOR }}>■</span> money paid in (every other transaction) · the gap is the gain or loss.
        </p>
        {error ? (
          <StatusMessage error={error} />
        ) : accounts === null ? (
          <StatusMessage loading />
        ) : (
          <AccountPicker
            accounts={owned}
            value={null}
            onChange={() => {}}
            values={shownIds}
            onChangeMany={change}
            placeholder="Pick accounts to chart"
            className="w-full md:w-80"
          />
        )}
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {series.map(s => {
          const account = byId.get(s.account_id)
          if (!account) return null
          return (
            <AccountValueChart
              key={s.account_id}
              accountId={s.account_id}
              name={account.name}
              currency={s.currency}
              points={s.points}
              percentage={percentageOf(account)}
              today={today}
            />
          )
        })}
      </div>
    </section>
  )
}
