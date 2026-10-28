import { Account, UserBalance } from '../api/client'
import { OTHER_TYPE_LABEL } from './accountGroups'

export interface NetWorthAccount {
  account: Account
  /** The user's ownership percentage of the account, 100 for the whole household. */
  percentage: number
  /** The part of the account's balance that belongs to the user. */
  share: number
}

export interface NetWorthTypeGroup {
  key: string
  label: string
  total: number
  accounts: NetWorthAccount[]
}

export interface NetWorthCurrency {
  currency: string
  groups: NetWorthTypeGroup[]
  /** Sum of every account share in this currency. */
  accountsTotal: number
  /** What the rest of the household owes the user (negative: what they owe), or null
   *  with no user selected, where every net position cancels out. */
  netPosition: number | null
  netWorth: number
  /** Accounts left out because they hold nothing. */
  zeroCount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

/** The user's net worth, per currency then per account type: each open account's
 *  balance times the user's ownership percentage (the whole balance with no user
 *  selected), plus the user's net position with the rest of the household. Types are
 *  ordered by total, largest first; accounts by share, then name. */
export function computeNetWorth(
  accounts: Account[],
  balances: UserBalance[],
  userId: number | null,
): NetWorthCurrency[] {
  const byCurrency = new Map<string, NetWorthCurrency>()
  const entry = (currency: string) => {
    let c = byCurrency.get(currency)
    if (!c) {
      c = { currency, groups: [], accountsTotal: 0, netPosition: null, netWorth: 0, zeroCount: 0 }
      byCurrency.set(currency, c)
    }
    return c
  }

  for (const account of accounts) {
    if (account.archived) continue
    const percentage = userId === null
      ? 100
      : account.users?.find(u => u.user_id === userId)?.ownership_percentage ?? 0
    if (percentage <= 0) continue
    const c = entry(account.currency)
    const share = round2(account.balance * percentage / 100)
    if (Math.abs(share) < 0.005) {
      c.zeroCount += 1
      continue
    }
    const label = account.type?.trim() || OTHER_TYPE_LABEL
    const key = label.toLowerCase()
    let group = c.groups.find(g => g.key === key)
    if (!group) {
      group = { key, label, total: 0, accounts: [] }
      c.groups.push(group)
    }
    group.accounts.push({ account, percentage, share })
    group.total = round2(group.total + share)
    c.accountsTotal = round2(c.accountsTotal + share)
  }

  if (userId !== null) {
    for (const b of balances) {
      if (b.user_id !== userId || Math.abs(b.net_position) < 0.005) continue
      const c = entry(b.currency)
      c.netPosition = round2((c.netPosition ?? 0) + b.net_position)
    }
  }

  return [...byCurrency.values()]
    .map(c => ({
      ...c,
      groups: c.groups
        .map(g => ({
          ...g,
          accounts: [...g.accounts].sort((x, y) => y.share - x.share || compare(x.account.name, y.account.name)),
        }))
        .sort((x, y) => y.total - x.total || compare(x.label, y.label)),
      netWorth: round2(c.accountsTotal + (c.netPosition ?? 0)),
    }))
    .filter(c => c.groups.length > 0 || c.netPosition !== null || c.zeroCount > 0)
    .sort((x, y) => compare(x.currency, y.currency))
}
