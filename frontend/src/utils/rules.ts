import { FilterCondition, RuleActions, RuleOutcome, SplitTier, TransactionSearchRequest, User } from '../api/client'

export const SPLIT_TIER_LABELS: Record<SplitTier, string> = {
  global: 'Global split',
  default: 'Default split (account, else category, else global)',
  account: "The account's split",
  category: "The category's split",
}

export function offsetLabel(offset: number): string {
  if (offset === 0) return 'No shift'
  const n = Math.abs(offset)
  return `${offset > 0 ? '+' : '-'}${n} month${n === 1 ? '' : 's'}`
}

function splitLabel(weights: { user_id: number; weight: number }[], users: User[]): string {
  const name = (id: number) => users.find(u => u.id === id)?.name ?? `User ${id}`
  return weights.map(w => `${name(w.user_id)} ${w.weight}`).join(' · ')
}

/** One line per thing a rule changes, for the before/after previews. */
export function describeOutcome(outcome: RuleOutcome, users: User[]): string[] {
  const lines: string[] = []
  if (outcome.payee !== null) lines.push(`Payee → ${outcome.payee}`)
  if (outcome.category_id !== null) lines.push(`Category → ${outcome.category_name ?? `#${outcome.category_id}`}`)
  if (outcome.accounting_month_offset !== null) lines.push(`Accounting month → ${offsetLabel(outcome.accounting_month_offset)}`)
  if (outcome.reconciled !== null) lines.push(outcome.reconciled ? 'Marked reconciled' : 'Marked not reconciled')
  if (outcome.split_weights) lines.push(`Split → ${splitLabel(outcome.split_weights, users)}`)
  if (outcome.add_tag_names && outcome.add_tag_names.length > 0) lines.push(`Tags + ${outcome.add_tag_names.map(n => `#${n}`).join(' ')}`)
  return lines
}

/** One line per action of a saved rule, for the rules list. */
export function describeActions(
  actions: RuleActions, users: User[], categoryName: (id: number) => string,
  tagName: (id: number) => string = id => `#${id}`,
): string[] {
  const lines: string[] = []
  if (actions.payee) lines.push(`Rename payee to "${actions.payee}"`)
  if (actions.category_id != null) lines.push(`File under ${categoryName(actions.category_id)}`)
  if (actions.accounting_month_offset != null) lines.push(`Accounting month ${offsetLabel(actions.accounting_month_offset)}`)
  if (actions.reconciled != null) lines.push(actions.reconciled ? 'Mark reconciled' : 'Mark not reconciled')
  if (actions.split_weights && actions.split_weights.length > 0) lines.push(`Split ${splitLabel(actions.split_weights, users)}`)
  if (actions.split_tier) lines.push(`Split: ${SPLIT_TIER_LABELS[actions.split_tier]}, as set when the rule runs`)
  if (actions.add_tag_ids && actions.add_tag_ids.length > 0) {
    lines.push(`Add tags ${actions.add_tag_ids.map(tagName).join(' ')}`)
  }
  return lines
}

/** The conditions a new rule starts from, taken from the Transactions screen's
 *  filters. */
export interface RuleDraft {
  conditions: FilterCondition[]
  match_mode: 'all' | 'any'
}

function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The simple filter as rule conditions. A rule has no OR across fields, so the
 *  search box (payee or memo on the screen) becomes "payee contains", and it has
 *  no reconciled condition, so that filter is left out. Dates and amounts are
 *  inclusive on the screen; the rule's before/after are strict, hence the day
 *  shift. */
export function simpleFiltersToConditions(f: TransactionSearchRequest): FilterCondition[] {
  const out: FilterCondition[] = []
  if (f.search?.trim()) out.push({ field: 'payee', operator: 'contains', value: f.search.trim() })
  if (f.account_id) out.push({ field: 'account_id', operator: 'eq', value: f.account_id })
  if (f.category_id) out.push({ field: 'category_id', operator: 'eq', value: f.category_id })
  if (f.uncategorized) out.push({ field: 'category_id', operator: 'eq', value: null })
  if (f.tag_id) out.push({ field: 'tag_id', operator: 'eq', value: f.tag_id })
  if (f.untagged) out.push({ field: 'tag_id', operator: 'eq', value: null })
  if (f.amount_min != null && f.amount_max != null) {
    out.push({ field: 'amount', operator: 'between', value: f.amount_min, value2: f.amount_max })
  } else if (f.amount_min != null) {
    out.push({ field: 'amount', operator: 'gte', value: f.amount_min })
  } else if (f.amount_max != null) {
    out.push({ field: 'amount', operator: 'lte', value: f.amount_max })
  }
  if (f.date_from && f.date_to) {
    out.push({ field: 'date', operator: 'between', value: f.date_from, value2: f.date_to })
  } else if (f.date_from) {
    out.push({ field: 'date', operator: 'after', value: shiftDay(f.date_from, -1) })
  } else if (f.date_to) {
    out.push({ field: 'date', operator: 'before', value: shiftDay(f.date_to, 1) })
  }
  return out
}
