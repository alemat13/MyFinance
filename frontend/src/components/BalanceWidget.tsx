import { UserBalance } from '../api/client'

interface Props {
  balances: UserBalance[]
}

const fmt = (n: number) =>
  Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function BalanceWidget({ balances }: Props) {
  if (balances.length === 0) return null

  let sentence: string | null = null
  if (balances.length === 2) {
    const [a, b] = balances
    if (Math.abs(a.net_position) < 0.01 && Math.abs(b.net_position) < 0.01) {
      sentence = 'All settled up'
    } else {
      const creditor = a.net_position > b.net_position ? a : b
      const debtor = a.net_position > b.net_position ? b : a
      sentence = `${debtor.user_name} owes ${creditor.user_name} ${fmt(creditor.net_position)}`
    }
  }

  return (
    <div style={{ padding: '12px 16px', marginBottom: '20px', border: '1px solid #ddd', borderRadius: '6px', background: '#f9f9f9' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Balance</div>
      {sentence ? (
        <div style={{ fontSize: '15px' }}>{sentence}</div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {balances.map(b => (
            <span key={b.user_id} style={{ fontSize: '13px', color: b.net_position >= 0 ? 'green' : 'red' }}>
              {b.user_name}: {b.net_position >= 0 ? '+' : '-'}{fmt(b.net_position)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
