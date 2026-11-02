import { Account } from '../api/client'

export interface AccountTypeGroup {
  /** Grouping key: the account's type, trimmed and lower-cased, so "Checking" and
   *  "checking " land together (the type is free text on the account form). */
  key: string
  label: string
  /** Where the user placed this type on the Accounts screen, null when never placed. */
  position: number | null
  accounts: Account[]
}

export interface GroupedAccounts {
  /** Open accounts, one group per type: groups in the user's order (unplaced types
   *  after, alphabetical), accounts alphabetical. */
  open: AccountTypeGroup[]
  /** Archived accounts, same grouping, shown together in one "Archived" sub-menu. */
  archived: AccountTypeGroup[]
}

export const OTHER_TYPE_LABEL = 'Other'

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

/** The user's order of type groups: placed types by position, then the rest. */
export function comparePositions(a: number | null | undefined, b: number | null | undefined): number {
  const x = a ?? null
  const y = b ?? null
  if (x !== null && y !== null) return x - y
  if (x !== null) return -1
  if (y !== null) return 1
  return 0
}

function groupByType(accounts: Account[]): AccountTypeGroup[] {
  const groups = new Map<string, AccountTypeGroup>()
  for (const a of accounts) {
    const label = a.type?.trim() || OTHER_TYPE_LABEL
    const key = label.toLowerCase()
    const group = groups.get(key) ?? { key, label, position: a.type_position ?? null, accounts: [] }
    group.accounts.push(a)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map(g => ({ ...g, accounts: [...g.accounts].sort((x, y) => compare(x.name, y.name)) }))
    .sort((x, y) => comparePositions(x.position, y.position) || compare(x.label, y.label))
}

/** Every type group, open or archived, once, in the order shown: what the reorder
 *  dialog lists. */
export function allTypeGroups(accounts: Account[]): AccountTypeGroup[] {
  return groupByType(accounts)
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
