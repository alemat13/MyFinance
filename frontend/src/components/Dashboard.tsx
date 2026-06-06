import { useEffect, useState } from 'react'
import { DashboardData, fetchDashboard } from '../api/client'
import AccountCard from './AccountCard'
import TransactionList from './TransactionList'

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch(err => {
        console.error(err)
        setError(err.message)
      })
  }, [])

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  if (!data) {
    return <div style={{ padding: '20px' }}>Loading...</div>
  }

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>MyFinance</h1>
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
