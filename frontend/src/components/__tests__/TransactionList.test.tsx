import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TransactionList from '../TransactionList'

test('renders transactions sorted by date desc', () => {
  const transactions = [
    { id: 1, date: '2026-02-01', payee: 'B', memo: null, amount: 100, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', splits: [] },
    { id: 2, date: '2026-01-01', payee: 'A', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', splits: [] },
  ]

  const { container } = render(<TransactionList transactions={transactions} />)

  const rows = container.querySelectorAll('tbody tr')
  expect(rows[0].textContent).toContain('B')
  expect(rows[1].textContent).toContain('A')
})

test('shows memo column when transaction has memo', () => {
  const transactions = [
    { id: 1, date: '2026-01-15', payee: 'Test', memo: 'notes', amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', splits: [] },
  ]

  render(<TransactionList transactions={transactions} />)

  expect(screen.getByText('Memo')).toBeInTheDocument()
})

test('hides memo column when no memos', () => {
  const transactions = [
    { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 50, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', splits: [] },
  ]

  render(<TransactionList transactions={transactions} />)

  expect(screen.queryByText('Memo')).toBeNull()
})

test('formats amount as currency', () => {
  const transactions = [
    { id: 1, date: '2026-01-15', payee: 'Test', memo: null, amount: 1234.5, account_id: 1, account_name: 'Checking', currency: 'USD', category_id: 1, category_name: 'Salary', splits: [] },
  ]

  render(<TransactionList transactions={transactions} />)

  expect(screen.getByText(/\$?1,234/)).toBeInTheDocument()
})
