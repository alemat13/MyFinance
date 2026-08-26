import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AccountCard from '../AccountCard'

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 1500.5, currency: 'USD', created_at: '2026-01-01', users: [] }

test('renders account name, type and formatted balance', () => {
  render(<AccountCard account={baseAccount} />)

  expect(screen.getByRole('heading', { name: 'Checking' })).toBeInTheDocument()
  expect(screen.getByText(/\$?1[,.]500/)).toBeInTheDocument()
})

test('displays positive balance in green', () => {
  render(<AccountCard account={{ ...baseAccount, balance: 500 }} />)

  const balanceElement = screen.getByText(/\$?500/)
  expect(balanceElement).toHaveClass('text-green-600')
})

test('displays negative balance in red', () => {
  render(<AccountCard account={{ ...baseAccount, balance: -200 }} />)

  const balanceElement = screen.getByText(/\$?200/)
  expect(balanceElement).toHaveClass('text-red-600')
})
