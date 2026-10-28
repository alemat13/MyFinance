import { describe, test, expect } from 'vitest'
import { Account, UserBalance } from '../../api/client'
import { computeNetWorth } from '../netWorth'

const account = (id: number, name: string, type: string, balance: number, owners: [number, number][], extra: Partial<Account> = {}): Account => ({
  id, name, type, balance, currency: 'EUR', created_at: '2026-01-01', archived: false,
  users: owners.map(([user_id, ownership_percentage]) => ({ user_id, user_name: `U${user_id}`, ownership_percentage })),
  split_weights: [],
  ...extra,
})

const accounts = [
  account(1, 'Alex checking', 'Checking', 1000, [[1, 100]]),
  account(2, 'Joint checking', 'Checking', 500, [[1, 50], [2, 50]]),
  account(3, 'PEA', 'Investment', 20000, [[1, 100]]),
  account(4, 'Olivia savings', 'Savings', 3000, [[2, 100]]),
  account(5, 'Empty card', 'Card', 0, [[1, 100]]),
  account(6, 'Closed', 'Checking', 50, [[1, 100]], { archived: true }),
  account(7, 'US broker', 'Investment', 100.01, [[1, 100]], { currency: 'USD' }),
]
const balances: UserBalance[] = [
  { user_id: 1, user_name: 'U1', currency: 'EUR', net_position: -120.5 },
  { user_id: 2, user_name: 'U2', currency: 'EUR', net_position: 120.5 },
]

describe('computeNetWorth', () => {
  test("a user's share follows ownership, grouped by type, largest first, plus their net position", () => {
    const [eur, usd] = computeNetWorth(accounts, balances, 1)
    expect(eur.currency).toBe('EUR')
    expect(eur.groups.map(g => [g.label, g.total])).toEqual([['Investment', 20000], ['Checking', 1250]])
    expect(eur.groups[1].accounts.map(a => [a.account.name, a.percentage, a.share])).toEqual([
      ['Alex checking', 100, 1000],
      ['Joint checking', 50, 250],
    ])
    expect(eur.accountsTotal).toBe(21250)
    expect(eur.netPosition).toBe(-120.5)
    expect(eur.netWorth).toBe(21129.5)
    expect(eur.zeroCount).toBe(1)
    expect(usd).toMatchObject({ currency: 'USD', accountsTotal: 100.01, netPosition: null, netWorth: 100.01 })
  })

  test('with no user selected, the whole household at 100% and no net position', () => {
    const [eur] = computeNetWorth(accounts, balances, null)
    expect(eur.accountsTotal).toBe(24500)
    expect(eur.netPosition).toBeNull()
    expect(eur.netWorth).toBe(24500)
  })

  test('accounts the user owns nothing of and archived accounts are left out', () => {
    const [eur] = computeNetWorth(accounts, balances, 2)
    expect(eur.groups.flatMap(g => g.accounts.map(a => a.account.name))).toEqual(['Olivia savings', 'Joint checking'])
    expect(eur.netWorth).toBe(3370.5)
  })
})
