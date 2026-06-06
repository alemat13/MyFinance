import { Account } from '../api/client'

interface Props {
  account: Account
}

export default function AccountCard({ account }: Props) {
  const formattedBalance = account.balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const balanceColor = account.balance >= 0 ? 'green' : 'red'

  return (
    <div style={{
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '16px',
      margin: '8px',
      minWidth: '200px',
      background: '#fff',
    }}>
      <h3 style={{ margin: '0 0 4px 0' }}>{account.name}</h3>
      <p style={{ margin: '0 0 8px 0', fontSize: '0.85em', color: '#666' }}>{account.type}</p>
      <p style={{ margin: 0, fontWeight: 'bold', color: balanceColor }}>
        {formattedBalance}
      </p>
    </div>
  )
}
