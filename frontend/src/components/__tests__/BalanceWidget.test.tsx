import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BalanceWidget from '../BalanceWidget'

test('renders nothing when there are no balances', () => {
  const { container } = render(<BalanceWidget balances={[]} />)
  expect(container).toBeEmptyDOMElement()
})

test('shows a friendly sentence for the 2-user case', () => {
  render(<BalanceWidget balances={[
    { user_id: 1, user_name: 'Alex', currency: 'USD', net_position: -50 },
    { user_id: 2, user_name: 'Olivia', currency: 'USD', net_position: 50 },
  ]} />)

  expect(screen.getByText('Alex owes Olivia $50.00')).toBeInTheDocument()
})

test('shows "all settled up" when balances are ~0', () => {
  render(<BalanceWidget balances={[
    { user_id: 1, user_name: 'Alex', currency: 'USD', net_position: 0 },
    { user_id: 2, user_name: 'Olivia', currency: 'USD', net_position: 0 },
  ]} />)

  expect(screen.getByText('All settled up')).toBeInTheDocument()
})

test('falls back to a per-user list for more than 2 users', () => {
  render(<BalanceWidget balances={[
    { user_id: 1, user_name: 'Alex', currency: 'USD', net_position: -50 },
    { user_id: 2, user_name: 'Olivia', currency: 'USD', net_position: 30 },
    { user_id: 3, user_name: 'Sam', currency: 'USD', net_position: 20 },
  ]} />)

  expect(screen.getByText(/Alex:/)).toBeInTheDocument()
  expect(screen.getByText(/Olivia:/)).toBeInTheDocument()
  expect(screen.getByText(/Sam:/)).toBeInTheDocument()
})

test('shows a separate settlement line per currency', () => {
  render(<BalanceWidget balances={[
    { user_id: 1, user_name: 'Alex', currency: 'USD', net_position: -50 },
    { user_id: 2, user_name: 'Olivia', currency: 'USD', net_position: 50 },
    { user_id: 1, user_name: 'Alex', currency: 'EUR', net_position: 20 },
    { user_id: 2, user_name: 'Olivia', currency: 'EUR', net_position: -20 },
  ]} />)

  expect(screen.getByText('Alex owes Olivia $50.00')).toBeInTheDocument()
  expect(screen.getByText('Olivia owes Alex €20.00')).toBeInTheDocument()
})
