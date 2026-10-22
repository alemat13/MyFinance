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

const containsRun = (words: string[], run: string[]) =>
  words.some((_, i) => run.every((w, j) => words[i + j] === w))

// The longest run of whole words every payee shares (case ignored), as the
// first payee writes it: the Link window's default name, e.g. "Virement" for
// "Virement vers Livret A" and "Virement depuis Joint Checking". Empty when
// they share no word.
export function commonPayeeText(payees: string[]): string {
  if (payees.length === 0) return ''
  const [first, ...others] = payees.map(p => p.trim().split(/\s+/).filter(Boolean))
  const othersLower = others.map(words => words.map(w => w.toLowerCase()))
  for (let length = first.length; length > 0; length--) {
    for (let start = 0; start + length <= first.length; start++) {
      const run = first.slice(start, start + length)
      const runLower = run.map(w => w.toLowerCase())
      if (othersLower.every(words => containsRun(words, runLower))) return run.join(' ')
    }
  }
  return ''
}
