import { Account } from '../api/client'
import { Card } from './ui'
import { formatMoney } from '../utils/currency'

interface Props {
  account: Account
}

export default function AccountCard({ account }: Props) {
  const formattedBalance = formatMoney(account.balance, account.currency)
  const balanceClass = account.balance >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'

  return (
    <Card className="p-4 m-2 min-w-[200px]">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{account.name}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{account.type}</p>
      <p className={`font-bold ${balanceClass}`}>{formattedBalance}</p>
    </Card>
  )
}
