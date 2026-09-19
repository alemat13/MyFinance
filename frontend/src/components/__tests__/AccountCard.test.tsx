import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AccountCard from '../AccountCard'

const baseAccount = { id: 1, name: 'Checking', type: 'Checking', balance: 1500.5, currency: 'USD', created_at: '2026-01-01', archived: false, users: [], split_weights: [] }

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

test('is not interactive when no onSelect handler is given', () => {
  render(<AccountCard account={baseAccount} />)

  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('calls onSelect with the account id when the tile is clicked', () => {
  const onSelect = vi.fn()
  render(<AccountCard account={baseAccount} onSelect={onSelect} />)

  fireEvent.click(screen.getByRole('button', { name: 'View transactions for Checking' }))

  expect(onSelect).toHaveBeenCalledWith(1)
})

test('calls onSelect when the tile is activated with the keyboard', () => {
  const onSelect = vi.fn()
  render(<AccountCard account={baseAccount} onSelect={onSelect} />)

  const tile = screen.getByRole('button', { name: 'View transactions for Checking' })
  expect(tile).toHaveAttribute('tabindex', '0')

  fireEvent.keyDown(tile, { key: 'Enter' })
  fireEvent.keyDown(tile, { key: ' ' })

  expect(onSelect).toHaveBeenCalledTimes(2)
})
