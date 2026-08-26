import { UserBalance } from '../api/client'
import { Card } from './ui'
import { formatMoney } from '../utils/currency'

interface Props {
  balances: UserBalance[]
}

const settlementLine = (balances: UserBalance[], currency: string) => {
  if (balances.length === 2) {
    const [a, b] = balances
    if (Math.abs(a.net_position) < 0.01 && Math.abs(b.net_position) < 0.01) {
      return 'All settled up'
    }
    const creditor = a.net_position > b.net_position ? a : b
    const debtor = a.net_position > b.net_position ? b : a
    return `${debtor.user_name} owes ${creditor.user_name} ${formatMoney(creditor.net_position, currency)}`
  }
  return null
}

export default function BalanceWidget({ balances }: Props) {
  if (balances.length === 0) return null

  const byCurrency = new Map<string, UserBalance[]>()
  for (const b of balances) {
    const group = byCurrency.get(b.currency) ?? []
    group.push(b)
    byCurrency.set(b.currency, group)
  }

  return (
    <Card className="px-4 py-3 mb-5">
      <div className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Balance</div>
      <div className="flex flex-col gap-1.5">
        {[...byCurrency.entries()].map(([currency, group]) => {
          const sentence = settlementLine(group, currency)
          return (
            <div key={currency}>
              {sentence ? (
                <div className="text-[15px] text-slate-800 dark:text-slate-100">{sentence}</div>
              ) : (
                <div className="flex gap-4 flex-wrap">
                  {group.map(b => (
                    <span
                      key={b.user_id}
                      className={`text-[13px] ${b.net_position >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                      {b.user_name}: {b.net_position >= 0 ? '+' : '-'}{formatMoney(Math.abs(b.net_position), currency)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
