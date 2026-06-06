import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AccountCard from '../AccountCard'

test('renders account name, type and formatted balance', () => {
  render(<AccountCard account={{ id: 1, name: 'Checking', type: 'Checking', balance: 1500.5, created_at: '2026-01-01' }} />)

  expect(screen.getByRole('heading', { name: 'Checking' })).toBeInTheDocument()
  expect(screen.getByText(/\$?1[,.]500/)).toBeInTheDocument()
})

test('displays positive balance in green', () => {
  render(<AccountCard account={{ id: 1, name: 'Checking', type: 'Checking', balance: 500, created_at: '2026-01-01' }} />)

  const balanceElement = screen.getByText(/\$?500/)
  expect(balanceElement).toHaveStyle({ color: 'rgb(0, 128, 0)' })
})

test('displays negative balance in red', () => {
  render(<AccountCard account={{ id: 1, name: 'Checking', type: 'Checking', balance: -200, created_at: '2026-01-01' }} />)

  const balanceElement = screen.getByText(/\$?200/)
  expect(balanceElement).toHaveStyle({ color: 'rgb(255, 0, 0)' })
})
