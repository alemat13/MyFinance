import { RuleActions, RuleOutcome, User } from '../api/client'

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
  return lines
}

/** One line per action of a saved rule, for the rules list. */
export function describeActions(
  actions: RuleActions, users: User[], categoryName: (id: number) => string,
): string[] {
  const lines: string[] = []
  if (actions.payee) lines.push(`Rename payee to "${actions.payee}"`)
  if (actions.category_id != null) lines.push(`File under ${categoryName(actions.category_id)}`)
  if (actions.accounting_month_offset != null) lines.push(`Accounting month ${offsetLabel(actions.accounting_month_offset)}`)
  if (actions.reconciled != null) lines.push(actions.reconciled ? 'Mark reconciled' : 'Mark not reconciled')
  if (actions.split_weights && actions.split_weights.length > 0) lines.push(`Split ${splitLabel(actions.split_weights, users)}`)
  return lines
}
