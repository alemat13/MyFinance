import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TransactionList from '../TransactionList'

test('renders transactions sorted by date desc', () => {
  const transactions = [
    { id: 1, date: '2026-02-01', payee: 'B', memo: null, amount: 100, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-02', splits: [] },
    { id: 2, date: '2026-01-01', payee: 'A', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', splits: [] },
  ]

  const { container } = render(<TransactionList transactions={transactions} />)

  const rows = container.querySelectorAll('tbody tr')
  expect(rows[0].textContent).toContain('B')
  expect(rows[1].textContent).toContain('A')
})

test('shows memo column when transaction has memo', () => {
  const transactions = [
    { id: 1, date: '2026-01-15', payee: 'Test', memo: 'notes', amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', splits: [] },
  ]

  render(<TransactionList transactions={transactions} />)

  expect(screen.getByText('Memo')).toBeInTheDocument()
})

test('hides memo column when no memos', () => {
  const transactions = [
    { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', splits: [] },
  ]

  render(<TransactionList transactions={transactions} />)

  expect(screen.queryByText('Memo')).toBeNull()
})

test('formats amount as currency', () => {
  const transactions = [
    { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 1234.5, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', accounting_month_offset: 0, accounting_month: '2026-01', splits: [] },
  ]

  render(<TransactionList transactions={transactions} />)

  expect(screen.getByText(/\$?1,234/)).toBeInTheDocument()
})

test('shows "Uncategorized" for a transaction with no category', () => {
  const transactions = [
    { id: 1, date: '2026-01-15', payee: 'Mystery', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: null, category_name: null, accounting_month_offset: 0, accounting_month: '2026-01', splits: [] },
  ]

  render(<TransactionList transactions={transactions} />)

  expect(screen.getByText('Uncategorized')).toBeInTheDocument()
})

test('shows a Shared badge with the user\'s share for a transaction on an account they do not own', () => {
  const transactions = [
    {
      id: 1, date: '2026-01-15', payee: 'Shared Bill', memo: null, amount: 100, account_id: 1,
      account_name: 'Joint Checking', currency: 'USD', category_id: 1, category_name: 'Groceries',
      accounting_month_offset: 0, accounting_month: '2026-01',
      splits: [{ user_id: 2, user_name: 'Bob', share_amount: 40, source: 'manual' as const }],
    },
  ]

  render(<TransactionList transactions={transactions} selectedUserId={2} accounts={[]} />)

  expect(screen.getByText(/your share/)).toBeInTheDocument()
  expect(screen.getByText(/40/)).toBeInTheDocument()
})

test('does not show a Shared badge for a transaction on an account the selected user owns', () => {
  const transactions = [
    {
      id: 1, date: '2026-01-15', payee: 'Own Bill', memo: null, amount: 100, account_id: 1,
      account_name: 'My Checking', currency: 'USD', category_id: 1, category_name: 'Groceries',
      accounting_month_offset: 0, accounting_month: '2026-01',
      splits: [],
    },
  ]

  render(
    <TransactionList
      transactions={transactions}
      selectedUserId={2}
      accounts={[{ id: 1, name: 'My Checking', type: 'Checking', balance: 0, currency: 'USD', created_at: '2026-01-01', users: [] }]}
    />
  )

  expect(screen.queryByText(/Shared/)).not.toBeInTheDocument()
})
