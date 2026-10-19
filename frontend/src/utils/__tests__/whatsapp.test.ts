import { test, expect } from 'vitest'
import { transactionLink, whatsAppText, whatsAppShareUrl, filteredListLink, whatsAppListText, LIST_SHARE_MAX_ROWS } from '../whatsapp'
import type { Transaction } from '../../api/client'

const txn: Transaction = {
  id: 42, date: '2026-10-09', payee: 'RET DAB 09/10 PARIS', memo: 'Cash for the market', amount: -100,
  account_id: 1, account_name: 'CC CCF Joint', currency: 'EUR',
  category_id: 3, category_name: 'Animaux', accounting_month_offset: 0, accounting_month: '2026-10',
  reconciled: false, divide_group_id: null,
  splits: [
    { user_id: 1, user_name: 'Alexandre', weight: 49876, share_amount: -53.24, source: 'global' },
    { user_id: 2, user_name: 'Olivia', weight: 43797, share_amount: -46.76, source: 'global' },
  ],
  tags: [{ id: 1, name: 'Vacances' }],
}

test('transactionLink opens the transaction on the Transactions view', () => {
  expect(transactionLink(42, 'https://finance.olivex.fr/')).toBe('https://finance.olivex.fr/?view=transactions&transaction=42')
})

test('whatsAppText uses WhatsApp markup and ends with the link', () => {
  const text = whatsAppText(txn, 'https://x/?view=transactions&transaction=42')
  expect(text).toBe([
    '*RET DAB 09/10 PARIS*',
    '📅 2026-10-09',
    '💶 *-€100.00*',
    '🏦 CC CCF Joint',
    '🏷️ Animaux',
    '📝 _Cash for the market_',
    '🔖 Vacances',
    '👥 Split:',
    '• Alexandre: -€53.24',
    '• Olivia: -€46.76',
    '',
    'https://x/?view=transactions&transaction=42',
  ].join('\n'))
})

test('whatsAppText skips a memo equal to the payee and shows a shifted accounting month', () => {
  const text = whatsAppText({ ...txn, memo: 'RET DAB 09/10 PARIS', accounting_month_offset: 1, tags: [], splits: [], reconciled: true }, 'L')
  expect(text).not.toContain('📝')
  expect(text).not.toContain('🔖')
  expect(text).toContain('🗓️ Accounting month:')
  expect(text).toContain('✅ Reconciled')
})

test('whatsAppShareUrl encodes the text for wa.me', () => {
  const url = whatsAppShareUrl(txn, 'https://x/?a=1&b=2')
  expect(url.startsWith('https://wa.me/?text=')).toBe(true)
  expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(whatsAppText(txn, 'https://x/?a=1&b=2'))
})

test('filteredListLink keeps the filters and drops page, admin and an open transaction', () => {
  const link = filteredListLink('https://f.fr/?view=transactions&account_id=3&page=4&admin&transaction=9&sort_dir=asc')
  expect(link).toBe('https://f.fr/?view=transactions&account_id=3&sort_dir=asc')
})

test('whatsAppListText lists the rows, caps them and totals per currency', () => {
  const many = Array.from({ length: LIST_SHARE_MAX_ROWS + 2 }, (_, i) => ({ ...txn, id: i, amount: -1.1 }))
  const text = whatsAppListText([...many, { ...txn, amount: 5, currency: 'USD' }], 'L')
  const lines = text.split('\n')
  expect(lines[0]).toBe(`*Transactions (${LIST_SHARE_MAX_ROWS + 3})*`)
  expect(lines[1]).toBe('• 2026-10-09 RET DAB 09/10 PARIS · Animaux: *-€1.10*')
  expect(text).toContain('_… and 3 more_')
  expect(text).toContain(`💶 Total: *-€${(1.1 * (LIST_SHARE_MAX_ROWS + 2)).toFixed(2)}* / *$5.00*`)
  expect(text.endsWith('\nL')).toBe(true)
})
