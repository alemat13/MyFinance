import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Account, UserBalance } from '../api/client'
import { Card } from './ui'
import { formatMoney } from '../utils/currency'
import { computeNetWorth } from '../utils/netWorth'

interface Props {
  accounts: Account[]
  balances: UserBalance[]
  selectedUserId: number | null
  onSelectAccount?: (accountId: number) => void
}

const amountClass = (n: number) => n >= 0
  ? 'text-green-600 dark:text-green-400'
  : 'text-red-600 dark:text-red-400'

const formatPercentage = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(2)}%`

export default function NetWorthCard({ accounts, balances, selectedUserId, onSelectAccount }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const currencies = computeNetWorth(accounts, balances, selectedUserId)
  if (currencies.length === 0) return null

  const toggle = (key: string) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <section aria-labelledby="net-worth-heading" className="mt-8">
      <h2 id="net-worth-heading" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Net worth</h2>
      <div className="flex flex-col gap-4">
        {currencies.map(c => (
          <Card key={c.currency} className="p-4" data-testid={`net-worth-${c.currency}`}>
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                {selectedUserId === null ? 'Household' : 'Your share'}{currencies.length > 1 ? ` · ${c.currency}` : ''}
              </span>
              <span className={`text-2xl font-bold ${amountClass(c.netWorth)}`}>{formatMoney(c.netWorth, c.currency)}</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {c.groups.map(g => {
                const key = `${c.currency}:${g.key}`
                const open = !collapsed.has(key)
                const percentOfTotal = c.accountsTotal > 0 && g.total > 0
                  ? Math.round(g.total / c.accountsTotal * 100)
                  : null
                return (
                  <div key={key} className="py-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 py-1 text-left"
                    >
                      <span className="text-slate-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                      <span className="flex-1 min-w-0 font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {g.label}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          {g.accounts.length}{percentOfTotal !== null ? ` · ${percentOfTotal}%` : ''}
                        </span>
                      </span>
                      <span className={`font-semibold tabular-nums ${amountClass(g.total)}`}>{formatMoney(g.total, c.currency)}</span>
                    </button>
                    {open && (
                      <ul className="mt-0.5 mb-1 ml-6">
                        {g.accounts.map(({ account, percentage, share }) => (
                          <li key={account.id}>
                            <button
                              type="button"
                              disabled={!onSelectAccount}
                              onClick={() => onSelectAccount?.(account.id)}
                              className="flex w-full items-baseline gap-2 rounded py-1 text-left enabled:hover:bg-slate-50 enabled:dark:hover:bg-slate-700/50"
                            >
                              <span className="flex-1 min-w-0">
                                <span className="block truncate text-sm text-slate-700 dark:text-slate-200">{account.name}</span>
                                {percentage < 100 && (
                                  <span className="block text-xs text-slate-400 dark:text-slate-500">
                                    {formatPercentage(percentage)} of {formatMoney(account.balance, c.currency)}
                                  </span>
                                )}
                              </span>
                              <span className={`text-sm tabular-nums ${amountClass(share)}`}>{formatMoney(share, c.currency)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>

            <dl className="mt-2 border-t border-slate-200 dark:border-slate-700 pt-2 text-sm">
              <div className="flex justify-between gap-3 py-0.5">
                <dt className="text-slate-600 dark:text-slate-300">Accounts</dt>
                <dd className={`tabular-nums ${amountClass(c.accountsTotal)}`}>{formatMoney(c.accountsTotal, c.currency)}</dd>
              </div>
              {c.netPosition !== null && (
                <div className="flex justify-between gap-3 py-0.5">
                  <dt className="text-slate-600 dark:text-slate-300">
                    {c.netPosition >= 0 ? 'Owed to you (Balance)' : 'You owe (Balance)'}
                  </dt>
                  <dd className={`tabular-nums ${amountClass(c.netPosition)}`}>{formatMoney(c.netPosition, c.currency)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 py-0.5 font-semibold">
                <dt className="text-slate-800 dark:text-slate-100">Net worth</dt>
                <dd className={`tabular-nums ${amountClass(c.netWorth)}`}>{formatMoney(c.netWorth, c.currency)}</dd>
              </div>
              {c.zeroCount > 0 && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {c.zeroCount} account{c.zeroCount > 1 ? 's' : ''} at zero not shown
                </p>
              )}
            </dl>
          </Card>
        ))}
      </div>
    </section>
  )
}
