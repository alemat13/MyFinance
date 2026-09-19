import { useEffect, useState } from 'react'
import { DashboardData, fetchDashboard } from '../api/client'
import { StatusMessage } from './ui'
import AccountCard from './AccountCard'
import TransactionList from './TransactionList'
import BalanceWidget from './BalanceWidget'

interface Props {
  selectedUserId: number | null
  onSelectAccount?: (accountId: number) => void
}

export default function Dashboard({ selectedUserId, onSelectAccount }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboard(selectedUserId ?? undefined)
      .then(setData)
      .catch(err => {
        console.error(err)
        setError(err.message)
      })
  }, [selectedUserId])

  if (error || !data) {
    return <StatusMessage loading={!data} error={error} />
  }

  return (
    <div>
      <BalanceWidget balances={data.balances} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {data.accounts.map(acc => (
          <AccountCard key={acc.id} account={acc} onSelect={onSelectAccount} />
        ))}
      </div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Recent Transactions</h2>
      <TransactionList transactions={data.recent_transactions} selectedUserId={selectedUserId} accounts={data.accounts} />
    </div>
  )
}
