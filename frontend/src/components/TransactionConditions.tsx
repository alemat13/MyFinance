import { Account, Category, FilterCondition, FilterField, User } from '../api/client'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import { UNCATEGORIZED_ID } from '../utils/categoryHierarchy'
import { Button, Select, Input } from './ui'

/** One row of the advanced filter, as the UI holds it: every value a string,
 *  since that is what an `<input>` gives back. `conditionsToFilters()` turns
 *  these into what the API expects. */
export interface ConditionRow {
  field: FilterField
  operator: string
  value: string
  value2: string
  // Only for a per-user field (USER_FIELDS): which user's figure it reads.
  userId?: string
}

const NUMERIC_OPERATORS = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'between', label: 'between' },
]

/** A user's own figures on a transaction, each condition naming the user:
 *  their split weight, their share, and their balance (share minus what their
 *  ownership of the account pays), as the Transactions screen shows them.
 *  Offered only where the builder is given the users (not in rules). */
export const USER_FIELDS: FilterField[] = ['split_weight', 'split_share', 'split_balance']
const NUMERIC_FIELDS: FilterField[] = ['amount', 'account_id', 'category_id', ...USER_FIELDS]

export const OPERATORS_BY_FIELD: Record<FilterField, { value: string; label: string }[]> = {
  payee: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
  ],
  memo: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
  ],
  raw_label: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
  ],
  amount: NUMERIC_OPERATORS,
  date: [
    { value: 'on', label: 'on' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
    { value: 'between', label: 'between' },
  ],
  account_id: [
    { value: 'eq', label: 'is' },
    { value: 'ne', label: 'is not' },
  ],
  category_id: [
    { value: 'eq', label: 'is' },
    { value: 'ne', label: 'is not' },
  ],
  split_weight: NUMERIC_OPERATORS,
  split_share: NUMERIC_OPERATORS,
  split_balance: NUMERIC_OPERATORS,
}

export const FIELD_LABELS: Record<FilterField, string> = {
  payee: 'Payee', memo: 'Memo', raw_label: 'Original label', amount: 'Amount', date: 'Date',
  account_id: 'Account', category_id: 'Category',
  split_weight: 'Split weight of', split_share: 'Share of', split_balance: 'Balance of',
}

export const emptyCondition: ConditionRow = { field: 'payee', operator: 'contains', value: '', value2: '' }

function coerceValue(field: FilterField, value: string): string | number {
  if (NUMERIC_FIELDS.includes(field)) return parseFloat(value)
  return value
}

const isUserField = (field: FilterField) => USER_FIELDS.includes(field)

/** Whether a value typed into a condition is complete enough to send. A date
 *  input reports a half-typed year as a real date ("2" of 2026 reads as
 *  0002-09-01), so a date counts only once its year has four digits from
 *  1000 on; a number only once it parses. */
function isCompleteValue(field: FilterField, value: string): boolean {
  if (value === '') return false
  if (field === 'date') {
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(value)
    return !!m && parseInt(m[1]) >= 1000 && !Number.isNaN(Date.parse(value))
  }
  if (NUMERIC_FIELDS.includes(field)) return !Number.isNaN(parseFloat(value))
  return true
}
// Fields where the user types a number.
const isNumberInput = (field: FilterField) => field === 'amount' || isUserField(field)

/** Drops the rows the user started but left empty or half-typed (a "between"
 *  missing its second bound included), so a condition being typed never
 *  narrows a selection behind their back nor reaches the API incomplete. */
export function conditionsToFilters(conditions: ConditionRow[]): FilterCondition[] {
  return conditions
    .filter(c => isCompleteValue(c.field, c.value) && (!isUserField(c.field) || !!c.userId))
    .filter(c => c.operator !== 'between' || isCompleteValue(c.field, c.value2))
    .map(c => ({
      field: c.field,
      operator: c.operator,
      // "Uncategorized" is sent as no category at all (IS NULL / IS NOT NULL).
      value: c.field === 'category_id' && c.value === String(UNCATEGORIZED_ID) ? null : coerceValue(c.field, c.value),
      value2: c.operator === 'between' ? coerceValue(c.field, c.value2) : undefined,
      ...(isUserField(c.field) ? { user_id: parseInt(c.userId!) } : {}),
    }))
}

interface Props {
  conditions: ConditionRow[]
  onChange: (rows: ConditionRow[]) => void
  matchMode: 'all' | 'any'
  onMatchModeChange: (mode: 'all' | 'any') => void
  accounts: Account[]
  categories: Category[]
  // Given, the per-user fields are offered too, one condition per user.
  users?: User[]
}

/** The advanced-filter condition builder, shared by the Transactions screen
 *  and the auto-categorization screen so a training selection is expressed in
 *  exactly the filters the user already knows. */
export default function TransactionConditions({
  conditions, onChange, matchMode, onMatchModeChange, accounts, categories, users,
}: Props) {
  const fields = (Object.keys(OPERATORS_BY_FIELD) as FilterField[])
    .filter(f => !isUserField(f) || (users && users.length > 0))
  const updateField = (i: number, field: FilterField) => {
    onChange(conditions.map((c, idx) => {
      if (idx !== i) return c
      const row: ConditionRow = { field, operator: OPERATORS_BY_FIELD[field][0].value, value: '', value2: '' }
      if (isUserField(field)) row.userId = c.userId || (users?.[0] ? String(users[0].id) : '')
      return row
    }))
  }
  const updateUser = (i: number, userId: string) =>
    onChange(conditions.map((c, idx) => idx === i ? { ...c, userId } : c))
  const updateOperator = (i: number, operator: string) =>
    onChange(conditions.map((c, idx) => idx === i ? { ...c, operator } : c))
  const updateValue = (i: number, key: 'value' | 'value2', value: string) =>
    onChange(conditions.map((c, idx) => idx === i ? { ...c, [key]: value } : c))

  return (
    <div>
      <div className="flex gap-2 items-center mb-2">
        <span className="text-xs text-slate-600 dark:text-slate-300">Match</span>
        <Select value={matchMode} onChange={e => onMatchModeChange(e.target.value as 'all' | 'any')}>
          <option value="all">ALL (AND)</option>
          <option value="any">ANY (OR)</option>
        </Select>
        <Button size="sm" onClick={() => onChange([...conditions, { ...emptyCondition }])}>+ Add condition</Button>
      </div>
      {conditions.map((c, i) => (
        <div key={i} className="flex gap-2 items-center mb-1.5 flex-wrap">
          <Select value={c.field} onChange={e => updateField(i, e.target.value as FilterField)} className="min-w-[110px]">
            {fields.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
          </Select>
          {isUserField(c.field) && (
            <Select value={c.userId ?? ''} onChange={e => updateUser(i, e.target.value)}
                    aria-label="User" className="min-w-[110px]">
              {(users ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          <Select value={c.operator} onChange={e => updateOperator(i, e.target.value)} className="min-w-[120px]">
            {OPERATORS_BY_FIELD[c.field].map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
          </Select>
          {c.field === 'account_id' ? (
            <AccountPicker
              accounts={accounts}
              value={c.value ? parseInt(c.value) : null}
              onChange={id => updateValue(i, 'value', id != null ? String(id) : '')}
              placeholder="Choose account"
              className="min-w-[140px]"
            />
          ) : c.field === 'category_id' ? (
            <CategoryPicker
              categories={categories}
              value={c.value ? parseInt(c.value) : null}
              onChange={id => updateValue(i, 'value', id != null ? String(id) : '')}
              anyLabel="Choose category"
              className="min-w-[140px]"
            />
          ) : (
            <Input
              type={isNumberInput(c.field) ? 'number' : c.field === 'date' ? 'date' : 'text'}
              step={c.field === 'amount' || c.field === 'split_share' || c.field === 'split_balance' ? '0.01' : undefined}
              value={c.value}
              onChange={e => updateValue(i, 'value', e.target.value)}
              className="w-[130px]"
            />
          )}
          {c.operator === 'between' && (
            <Input
              type={isNumberInput(c.field) ? 'number' : 'date'}
              step={c.field === 'amount' || c.field === 'split_share' || c.field === 'split_balance' ? '0.01' : undefined}
              value={c.value2}
              onChange={e => updateValue(i, 'value2', e.target.value)}
              className="w-[130px]"
            />
          )}
          <Button size="sm" variant="danger" onClick={() => onChange(conditions.filter((_, idx) => idx !== i))}>×</Button>
        </div>
      ))}
      {conditions.length === 0 && (
        <div className="text-xs text-slate-400">No conditions yet — add one to filter.</div>
      )}
    </div>
  )
}
