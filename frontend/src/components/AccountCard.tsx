import { KeyboardEvent } from 'react'
import { Account } from '../api/client'
import { Card } from './ui'
import { formatMoney } from '../utils/currency'

function formatLastTransactionDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

interface Props {
  account: Account
  onSelect?: (accountId: number) => void
}

export default function AccountCard({ account, onSelect }: Props) {
  const formattedBalance = formatMoney(account.balance, account.currency)
  const balanceClass = account.balance >= 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(account.id)
    }
  }

  const interactive = onSelect
    ? {
      role: 'button',
      tabIndex: 0,
      'aria-label': `View transactions for ${account.name}`,
      onClick: () => onSelect(account.id),
      onKeyDown: handleKeyDown,
    }
    : {}

  return (
    <Card
      className={`p-4 ${onSelect ? 'cursor-pointer transition-shadow hover:shadow-md hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent' : ''}`}
      {...interactive}
    >
      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{account.name}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{account.type}</p>
      <p className={`font-bold ${balanceClass}`}>{formattedBalance}</p>
      {account.last_transaction_date && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Last transaction {formatLastTransactionDate(account.last_transaction_date)}
        </p>
      )}
    </Card>
  )
}
