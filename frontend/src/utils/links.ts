import { Transaction, TransactionLinkTotal } from '../api/client'
import { formatMoney } from './currency'

// What a set of transactions nets to, per currency (the server's
// TransactionLinkOut.totals, computed here for a selection not yet linked).
export function netByCurrency(transactions: Pick<Transaction, 'amount' | 'currency'>[]): TransactionLinkTotal[] {
  const totals = new Map<string, number>()
  transactions.forEach(t => totals.set(t.currency, (totals.get(t.currency) ?? 0) + t.amount))
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
}

export function formatNet(totals: TransactionLinkTotal[]): string {
  return totals.map(t => formatMoney(t.amount, t.currency)).join(' / ')
}
