import { useEffect, useState } from 'react'
import { Account, fetchAccounts } from '../api/client'

interface Props {
  onBack: () => void
}

export default function AccountsList({ onBack }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAccounts()
      .then(setAccounts)
      .catch(err => {
        console.error(err)
        setError(err.message)
      })
  }, [])

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  if (!accounts.length) {
    return <div style={{ padding: '20px' }}>Loading...</div>
  }

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none',
        border: 'none',
        color: '#0066cc',
        cursor: 'pointer',
        fontSize: '14px',
        marginBottom: '16px',
        padding: 0,
      }}>
        ← Back to Dashboard
      </button>
      <h2 style={{ marginBottom: '12px' }}>Accounts</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ background: '#eee', textAlign: 'left' }}>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Type</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={tdStyle}>{a.name}</td>
              <td style={tdStyle}>{a.type}</td>
              <td style={{ ...tdStyle, textAlign: 'right', color: a.balance >= 0 ? 'green' : 'red' }}>
                {a.balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '2px solid #ccc',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
}
