import { useEffect, useState } from 'react'
import { DashboardData, fetchDashboard } from '../api/client'
import AccountCard from './AccountCard'
import TransactionList from './TransactionList'
import BalanceWidget from './BalanceWidget'

interface Props {
  selectedUserId: number | null
}

export default function Dashboard({ selectedUserId }: Props) {
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

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  if (!data) {
    return <div style={{ padding: '20px' }}>Loading...</div>
  }

  return (
    <div>
      <BalanceWidget balances={data.balances} />
      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '32px' }}>
        {data.accounts.map(acc => (
          <AccountCard key={acc.id} account={acc} />
        ))}
      </div>
      <h2 style={{ marginBottom: '12px' }}>Recent Transactions</h2>
      <TransactionList transactions={data.recent_transactions} />
    </div>
  )
}
