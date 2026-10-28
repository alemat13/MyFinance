import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const { mockFetchAccounts, mockFetchAccountValue } = vi.hoisted(() => ({
  mockFetchAccounts: vi.fn(),
  mockFetchAccountValue: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  fetchAccounts: mockFetchAccounts,
  fetchAccountValue: mockFetchAccountValue,
}))

import AccountValueSection from '../AccountValueSection'

const account = (id: number, name: string, users: { user_id: number; ownership_percentage: number }[]) => ({
  id, name, type: 'Investment', currency: 'EUR', balance: 0, archived: false, users,
})

beforeEach(() => {
  localStorage.clear()
  mockFetchAccounts.mockReset().mockResolvedValue([
    account(1, 'PEA', [{ user_id: 1, ownership_percentage: 100 }]),
    account(2, 'Joint AV', [{ user_id: 1, ownership_percentage: 50 }, { user_id: 2, ownership_percentage: 50 }]),
    account(3, 'Olivia PER', [{ user_id: 2, ownership_percentage: 100 }]),
  ])
  mockFetchAccountValue.mockReset().mockImplementation((ids: number[]) => Promise.resolve(ids.map(id => ({
    account_id: id,
    currency: 'EUR',
    points: [
      { date: '2024-01-01', value: 1000, contributions: 1000 },
      { date: '2026-01-01', value: 1300, contributions: 1100 },
    ],
  }))))
})

test('charts the remembered accounts, scaled to the user share, and remembers a new pick', async () => {
  localStorage.setItem('chartsValueAccountIds:1', JSON.stringify([2]))
  render(<AccountValueSection userId={1} />)

  const card = await screen.findByRole('region', { name: 'Joint AV value' })
  expect(mockFetchAccountValue).toHaveBeenCalledWith([2])
  expect(within(card).getByText('your share: 50%')).toBeInTheDocument()
  expect(within(card).getByText('€650.00')).toBeInTheDocument()
  expect(within(card).getByText('+€550.00')).toBeInTheDocument()
  expect(within(card).getByText('+€100.00')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /Joint AV/ }))
  // Someone else's account isn't offered.
  expect(screen.queryByText('Olivia PER')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('PEA'))
  await waitFor(() => expect(mockFetchAccountValue).toHaveBeenLastCalledWith([2, 1]))
  expect(JSON.parse(localStorage.getItem('chartsValueAccountIds:1')!)).toEqual([2, 1])
  expect(await screen.findByRole('region', { name: 'PEA value' })).toBeInTheDocument()
})

test('nothing picked: no chart and no fetch', async () => {
  render(<AccountValueSection userId={1} />)
  expect(await screen.findByRole('button', { name: /Pick accounts to chart/ })).toBeInTheDocument()
  expect(mockFetchAccountValue).not.toHaveBeenCalled()
})
