import type { Transaction } from '../api/client'
import { formatMoney } from './currency'
import { accountingMonthLabel } from './transactions'

// The link that opens this transaction in the app: TransactionsPage opens
// `?transaction=` on mount, and App switches to the view named by `view`.
export function transactionLink(id: number, base = `${window.location.origin}${window.location.pathname}`): string {
  return `${base}?view=transactions&transaction=${id}`
}

// WhatsApp's own markup, not Markdown: *bold*, _italic_, ~strike~, and a
// line break per field. The markers only take effect around text with no
// space next to them, so a value is trimmed before it is wrapped.
const bold = (s: string) => `*${s.trim()}*`
const italic = (s: string) => `_${s.trim()}_`

export function whatsAppText(t: Transaction, link: string): string {
  const lines = [
    bold(t.payee || 'Transaction'),
    `📅 ${t.date}`,
    `💶 ${bold(formatMoney(t.amount, t.currency))}`,
    `🏦 ${t.account_name}`,
    `🏷️ ${t.category_name ?? 'Uncategorized'}`,
  ]
  if (t.accounting_month_offset !== 0) {
    lines.push(`🗓️ Accounting month: ${accountingMonthLabel(t.date, t.accounting_month_offset)}`)
  }
  if (t.memo && t.memo.trim() && t.memo.trim() !== t.payee.trim()) {
    lines.push(`📝 ${italic(t.memo)}`)
  }
  if (t.tags && t.tags.length > 0) {
    lines.push(`🔖 ${t.tags.map(tag => tag.name).join(', ')}`)
  }
  if (t.splits.length > 0) {
    lines.push('👥 Split:')
    for (const s of t.splits) lines.push(`• ${s.user_name}: ${formatMoney(s.share_amount, t.currency)}`)
  }
  if (t.reconciled) lines.push('✅ Reconciled')
  lines.push('', link)
  return lines.join('\n')
}

export function whatsAppShareUrl(t: Transaction, link = transactionLink(t.id)): string {
  return `https://wa.me/?text=${encodeURIComponent(whatsAppText(t, link))}`
}
