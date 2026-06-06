import { Transaction } from '../api/client'

interface Props {
  transactions: Transaction[]
}

export default function TransactionList({ transactions }: Props) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const hasMemo = sorted.some(t => t.memo !== null)

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
      <thead>
        <tr style={{ background: '#eee', textAlign: 'left' }}>
          <th style={thStyle}>Date</th>
          <th style={thStyle}>Payee</th>
          <th style={thStyle}>Category</th>
          <th style={thStyle}>Account</th>
          {hasMemo && <th style={thStyle}>Memo</th>}
          <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(t => (
          <tr key={t.id} style={{ borderBottom: '1px solid #ddd' }}>
            <td style={tdStyle}>{t.date}</td>
            <td style={tdStyle}>{t.payee}</td>
            <td style={tdStyle}>{t.category_name}</td>
            <td style={tdStyle}>{t.account_name}</td>
            {hasMemo && <td style={tdStyle}>{t.memo ?? ''}</td>}
            <td style={{ ...tdStyle, textAlign: 'right', color: t.amount >= 0 ? 'green' : 'red' }}>
              {t.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '2px solid #ccc',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
}
