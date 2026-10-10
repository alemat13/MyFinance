import { Account } from '../api/client'

export interface AccountTypeGroup {
  /** Grouping key: the account's type, trimmed and lower-cased, so "Checking" and
   *  "checking " land together (the type is free text on the account form). */
  key: string
  label: string
  accounts: Account[]
}

export interface GroupedAccounts {
  /** Open accounts, one group per type, groups and accounts alphabetical. */
  open: AccountTypeGroup[]
  /** Archived accounts, same grouping, shown together in one "Archived" sub-menu. */
  archived: AccountTypeGroup[]
}

export const OTHER_TYPE_LABEL = 'Other'

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

function groupByType(accounts: Account[]): AccountTypeGroup[] {
  const groups = new Map<string, AccountTypeGroup>()
  for (const a of accounts) {
    const label = a.type?.trim() || OTHER_TYPE_LABEL
    const key = label.toLowerCase()
    const group = groups.get(key) ?? { key, label, accounts: [] }
    group.accounts.push(a)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map(g => ({ ...g, accounts: [...g.accounts].sort((x, y) => compare(x.name, y.name)) }))
    .sort((x, y) => compare(x.label, y.label))
}

export function groupAccounts(accounts: Account[]): GroupedAccounts {
  return {
    open: groupByType(accounts.filter(a => !a.archived)),
    archived: groupByType(accounts.filter(a => a.archived)),
  }
}

/** Matches an account by its own name or its type, case-insensitively — the same
 *  rule the category picker applies to a subcategory and its parent. */
export function accountMatchesSearch(account: Account, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return account.name.toLowerCase().includes(q) || (account.type ?? '').toLowerCase().includes(q)
}

/** Narrows each group to its matching accounts and drops the groups left empty. */
export function filterGroups(groups: AccountTypeGroup[], query: string): AccountTypeGroup[] {
  return groups
    .map(g => ({ ...g, accounts: g.accounts.filter(a => accountMatchesSearch(a, query)) }))
    .filter(g => g.accounts.length > 0)
}
