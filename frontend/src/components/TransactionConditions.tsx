import { Account, Category, ConditionGroup, ConditionItem, FilterCondition, FilterField, TagRef, User } from '../api/client'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import { UNCATEGORIZED_ID } from '../utils/categoryHierarchy'
import { UNTAGGED_ID } from '../utils/tags'
import { Button, Select, Input, NumberInput, parseNumber } from './ui'

/** One row of the advanced filter, as the UI holds it: every value a string,
 *  since that is what an `<input>` gives back. `conditionsToFilters()` turns
 *  these into what the API expects. */
export interface ConditionRow {
  field: FilterField
  operator: string
  // Account and category ("is in" / "is not in"): the ids picked, comma-separated.
  value: string
  value2: string
  // Only for a per-user field (USER_FIELDS): which user's figure it reads.
  userId?: string
}

/** Conditions in brackets, joined by their own ALL / ANY and standing as one
 *  condition among the others: "Account is X and (Payee contains A or B)".
 *  One level deep: a group holds plain rows only. */
export interface ConditionGroupRow {
  matchMode: 'all' | 'any'
  conditions: ConditionRow[]
}

/** One entry of the builder: a row, or a group of rows. */
export type ConditionItemRow = ConditionRow | ConditionGroupRow

export const isConditionGroup = (c: ConditionItem): c is ConditionGroup => 'conditions' in c

export const isGroupRow = (c: ConditionItemRow): c is ConditionGroupRow => 'conditions' in c

/** A group starts as an "either of" of one empty row, the usual reason to
 *  open one. */
export const emptyGroup = (): ConditionGroupRow => ({ matchMode: 'any', conditions: [{ ...emptyCondition }] })

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
export const USER_FIELDS: FilterField[] = [
  'split_weight', 'split_share', 'split_share_abs', 'split_balance', 'split_balance_abs',
]
/** The "(abs)" fields, read without their sign; their value is never negative. */
const ABS_FIELDS: FilterField[] = ['amount_abs', 'split_share_abs', 'split_balance_abs']
/** Text operators where `*` matches any run of characters and `?` exactly one
 * (filtering.like_pattern() on the server, mirrored by rules). */
const WILDCARD_OPERATORS = new Set(['contains', 'starts_with', 'ends_with'])
const WILDCARD_HINT = '* matches any characters, ? exactly one'

/** Fields a search can use but a rule cannot: the per-user figures (an
 *  imported row has no split yet), when a row was added (it has not been)
 *  and whether it is linked (it is not yet). */
export const SEARCH_ONLY_FIELDS: FilterField[] = [...USER_FIELDS, 'created_at', 'linked']
/** Yes / No fields. */
const BOOL_FIELDS: FilterField[] = ['reconciled', 'linked']
const NUMERIC_FIELDS: FilterField[] = [
  'amount', 'amount_abs', 'account_id', 'category_id', 'tag_id', 'accounting_month_offset', ...USER_FIELDS,
]
/** Fields picked from a list, several at a time ("is in" / "is not in"). */
const LIST_FIELDS: FilterField[] = ['account_id', 'category_id']
const isListField = (field: FilterField) => LIST_FIELDS.includes(field)
const LIST_OPERATORS = [
  { value: 'in', label: 'is in' },
  { value: 'not_in', label: 'is not in' },
]
/** A row saved before "is in" existed says "is" / "is not" of a single id:
 *  the same thing as a list of one. */
const listOperator = (operator: string) => operator === 'eq' ? 'in' : operator === 'ne' ? 'not_in' : operator
export const listIds = (value: string): number[] =>
  value.split(',').map(v => parseInt(v)).filter(n => !Number.isNaN(n))
const DATE_FIELDS: FilterField[] = ['date', 'created_at', 'raw_initiated_date', 'raw_booking_date']
const isDateField = (field: FilterField) => DATE_FIELDS.includes(field)
/** The month a transaction counts toward (its date shifted by its accounting
 *  month shift), typed as "YYYY-MM": how the Charts page buckets it. */
const isMonthField = (field: FilterField) => field === 'accounting_month'

const TEXT_OPERATORS = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
]
const DATE_OPERATORS = [
  { value: 'on', label: 'on' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
  { value: 'between', label: 'between' },
]

export const OPERATORS_BY_FIELD: Record<FilterField, { value: string; label: string }[]> = {
  payee: TEXT_OPERATORS,
  memo: TEXT_OPERATORS,
  raw_label: TEXT_OPERATORS,
  amount: NUMERIC_OPERATORS,
  amount_abs: NUMERIC_OPERATORS,
  date: DATE_OPERATORS,
  account_id: LIST_OPERATORS,
  category_id: LIST_OPERATORS,
  tag_id: [
    { value: 'eq', label: 'is' },
    { value: 'ne', label: 'is not' },
  ],
  reconciled: [{ value: 'eq', label: 'is' }],
  linked: [{ value: 'eq', label: 'is' }],
  accounting_month_offset: NUMERIC_OPERATORS,
  accounting_month: DATE_OPERATORS,
  created_at: DATE_OPERATORS,
  raw_counterparty: TEXT_OPERATORS,
  raw_transaction_code: TEXT_OPERATORS,
  raw_merchant_category_code: TEXT_OPERATORS,
  raw_merchant_location: TEXT_OPERATORS,
  raw_initiated_date: DATE_OPERATORS,
  raw_booking_date: DATE_OPERATORS,
  split_weight: NUMERIC_OPERATORS,
  split_share: NUMERIC_OPERATORS,
  split_share_abs: NUMERIC_OPERATORS,
  split_balance: NUMERIC_OPERATORS,
  split_balance_abs: NUMERIC_OPERATORS,
}

// Bank fields read as the transaction's "As reported by the bank" section
// names them.
export const FIELD_LABELS: Record<FilterField, string> = {
  payee: 'Payee', memo: 'Memo', raw_label: 'Original label', amount: 'Amount', amount_abs: 'Amount (abs)', date: 'Date',
  account_id: 'Account', category_id: 'Category', tag_id: 'Tag',
  reconciled: 'Reconciled', linked: 'Linked', accounting_month_offset: 'Accounting month shift',
  accounting_month: 'Accounting month', created_at: 'Added on',
  raw_counterparty: 'Counterparty', raw_transaction_code: 'Bank transaction code / type',
  raw_merchant_category_code: 'Merchant category code', raw_merchant_location: 'Merchant location',
  raw_initiated_date: 'Purchase date', raw_booking_date: 'Booking date',
  split_weight: 'Split weight of', split_share: 'Share of', split_balance: 'Balance of',
  split_share_abs: 'Share of (abs)', split_balance_abs: 'Balance of (abs)',
}

export const emptyCondition: ConditionRow = { field: 'payee', operator: 'contains', value: '', value2: '' }

function coerceValue(field: FilterField, value: string): string | number | boolean {
  if (BOOL_FIELDS.includes(field)) return value === 'true'
  if (NUMERIC_FIELDS.includes(field)) return parseNumber(value) ?? NaN
  return value
}

const isUserField = (field: FilterField) => USER_FIELDS.includes(field)

/** Whether a value typed into a condition is complete enough to send. A date
 *  input reports a half-typed year as a real date ("2" of 2026 reads as
 *  0002-09-01), so a date counts only once its year has four digits from
 *  1000 on; a number only once it parses. */
function isCompleteValue(field: FilterField, value: string): boolean {
  if (value === '') return false
  if (isListField(field)) return listIds(value).length > 0
  if (isDateField(field)) {
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(value)
    return !!m && parseInt(m[1]) >= 1000 && !Number.isNaN(Date.parse(value))
  }
  if (isMonthField(field)) {
    const m = /^(\d{4})-(\d{2})$/.exec(value)
    return !!m && parseInt(m[1]) >= 1000 && parseInt(m[2]) >= 1 && parseInt(m[2]) <= 12
  }
  if (NUMERIC_FIELDS.includes(field)) return parseNumber(value) !== null
  return true
}
// Fields where the user types a number.
const isNumberInput = (field: FilterField) =>
  field === 'amount' || field === 'amount_abs' || field === 'accounting_month_offset' || isUserField(field)

function rowToFilter(c: ConditionRow): FilterCondition {
  return isListField(c.field) ? {
    field: c.field,
    operator: listOperator(c.operator),
    // "Uncategorized" is sent as no category at all (IS NULL).
    value: listIds(c.value).map(id => id === UNCATEGORIZED_ID ? null : id),
  } : {
    field: c.field,
    operator: c.operator,
    // "No tag" is sent as no tag at all: "Tag is No tag" is the untagged rows.
    value: (c.field === 'tag_id' && c.value === String(UNTAGGED_ID))
      ? null : coerceValue(c.field, c.value),
    value2: c.operator === 'between' ? coerceValue(c.field, c.value2) as string | number : undefined,
    ...(isUserField(c.field) ? { user_id: parseInt(c.userId!) } : {}),
  }
}

function completeRows(rows: ConditionRow[]): ConditionRow[] {
  return rows
    .filter(c => isCompleteValue(c.field, c.value) && (!isUserField(c.field) || !!c.userId))
    .filter(c => c.operator !== 'between' || isCompleteValue(c.field, c.value2))
}

/** Drops the rows the user started but left empty or half-typed (a "between"
 *  missing its second bound included), so a condition being typed never
 *  narrows a selection behind their back nor reaches the API incomplete. A
 *  group left with no complete row is dropped too, and one left with a single
 *  row is sent as that row. `exclude` leaves out fields, groups included
 *  (a rule cannot test SEARCH_ONLY_FIELDS). */
export function conditionsToFilters(items: ConditionItemRow[], exclude: FilterField[] = []): ConditionItem[] {
  const keep = (rows: ConditionRow[]) => completeRows(rows).filter(c => !exclude.includes(c.field)).map(rowToFilter)
  return items.flatMap((item): ConditionItem[] => {
    if (!isGroupRow(item)) return keep([item])
    const conditions = keep(item.conditions)
    if (conditions.length <= 1) return conditions
    return [{ match_mode: item.matchMode, conditions }]
  })
}

interface Props {
  conditions: ConditionItemRow[]
  onChange: (rows: ConditionItemRow[]) => void
  matchMode: 'all' | 'any'
  onMatchModeChange: (mode: 'all' | 'any') => void
  accounts: Account[]
  categories: Category[]
  // Given, the Tag field is offered.
  tags?: TagRef[]
  // Given, the per-user fields are offered too, one condition per user.
  users?: User[]
  // Leaves out the fields a rule cannot test (SEARCH_ONLY_FIELDS).
  forRules?: boolean
}

type RowContext = Pick<Props, 'accounts' | 'categories' | 'tags' | 'users'> & { fields: FilterField[] }

function MatchSelect({ value, onChange, label }: {
  value: 'all' | 'any'; onChange: (mode: 'all' | 'any') => void; label: string
}) {
  return (
    <Select aria-label={label} value={value} onChange={e => onChange(e.target.value as 'all' | 'any')}>
      <option value="all">ALL (AND)</option>
      <option value="any">ANY (OR)</option>
    </Select>
  )
}

/** One condition: field, operator, value(s), and its remove button. */
function ConditionRowEditor({ c, onChange, onRemove, ctx }: {
  c: ConditionRow; onChange: (row: ConditionRow) => void; onRemove: () => void; ctx: RowContext
}) {
  const { accounts, categories, tags, users, fields } = ctx
  const updateField = (field: FilterField) => {
    const row: ConditionRow = { field, operator: OPERATORS_BY_FIELD[field][0].value, value: '', value2: '' }
    if (isUserField(field)) row.userId = c.userId || (users?.[0] ? String(users[0].id) : '')
    onChange(row)
  }
  const updateValue = (key: 'value' | 'value2', value: string) => onChange({ ...c, [key]: value })

  // Weights and month shifts are whole numbers; a weight is never negative,
  // nor is an "(abs)" figure.
  const numberField = (key: 'value' | 'value2') => (
    <NumberInput
      integer={c.field === 'split_weight' || c.field === 'accounting_month_offset'}
      signed={c.field !== 'split_weight' && !ABS_FIELDS.includes(c.field)}
      value={parseNumber(c[key])}
      onValueChange={v => updateValue(key, v == null ? '' : String(v))}
      className="w-[130px]"
    />
  )

  return (
    <div className="flex gap-2 items-center mb-1.5 flex-wrap">
      <Select value={c.field} onChange={e => updateField(e.target.value as FilterField)} className="min-w-[110px]">
        {fields.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
      </Select>
      {isUserField(c.field) && (
        <Select value={c.userId ?? ''} onChange={e => onChange({ ...c, userId: e.target.value })}
                aria-label="User" className="min-w-[110px]">
          {(users ?? []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      )}
      <Select value={isListField(c.field) ? listOperator(c.operator) : c.operator}
              onChange={e => onChange({ ...c, operator: e.target.value })} className="min-w-[120px]">
        {OPERATORS_BY_FIELD[c.field].map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
      </Select>
      {c.field === 'account_id' ? (
        <AccountPicker
          accounts={accounts}
          value={null}
          onChange={() => {}}
          values={listIds(c.value)}
          onChangeMany={ids => updateValue('value', ids.join(','))}
          placeholder="Choose accounts"
          className="min-w-[140px]"
        />
      ) : c.field === 'category_id' ? (
        <CategoryPicker
          categories={categories}
          value={null}
          onChange={() => {}}
          values={listIds(c.value)}
          onChangeMany={ids => updateValue('value', ids.join(','))}
          anyLabel="Choose categories"
          className="min-w-[140px]"
        />
      ) : BOOL_FIELDS.includes(c.field) ? (
        <Select aria-label={`${FIELD_LABELS[c.field]} value`} value={c.value} onChange={e => updateValue('value', e.target.value)}
                className="min-w-[140px]">
          <option value="">Choose</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      ) : c.field === 'tag_id' ? (
        <Select aria-label="Tag value" value={c.value} onChange={e => updateValue('value', e.target.value)}
                className="min-w-[140px]">
          <option value="">Choose tag</option>
          <option value={UNTAGGED_ID}>No tag</option>
          {(tags ?? []).map(t => <option key={t.id} value={t.id}>#{t.name}</option>)}
        </Select>
      ) : isNumberInput(c.field) ? (
        numberField('value')
      ) : (
        <Input
          type={isDateField(c.field) ? 'date' : isMonthField(c.field) ? 'month' : 'text'}
          value={c.value}
          onChange={e => updateValue('value', e.target.value)}
          title={WILDCARD_OPERATORS.has(c.operator) ? WILDCARD_HINT : undefined}
          className={isMonthField(c.field) ? 'w-[170px]' : 'w-[130px]'}
        />
      )}
      {c.operator === 'between' && (isNumberInput(c.field) ? numberField('value2') : (
        <Input
          type={isMonthField(c.field) ? 'month' : 'date'}
          value={c.value2}
          onChange={e => updateValue('value2', e.target.value)}
          className={isMonthField(c.field) ? 'w-[170px]' : 'w-[130px]'}
        />
      ))}
      <Button size="sm" variant="danger" aria-label="Remove condition" onClick={onRemove}>×</Button>
    </div>
  )
}

/** The advanced-filter condition builder, shared by the Transactions screen,
 *  the rules and the auto-categorization screen so a training selection is
 *  expressed in exactly the filters the user already knows. Besides plain
 *  conditions it holds groups: conditions in brackets with their own
 *  ALL / ANY, one level deep. */
export default function TransactionConditions({
  conditions, onChange, matchMode, onMatchModeChange, accounts, categories, tags, users, forRules,
}: Props) {
  const fields = (Object.keys(OPERATORS_BY_FIELD) as FilterField[])
    .filter(f => !isUserField(f) || (users && users.length > 0))
    .filter(f => f !== 'tag_id' || tags !== undefined)
    .filter(f => !forRules || !SEARCH_ONLY_FIELDS.includes(f))
  const ctx: RowContext = { accounts, categories, tags, users, fields }
  const replace = (i: number, item: ConditionItemRow) =>
    onChange(conditions.map((c, idx) => idx === i ? item : c))
  const remove = (i: number) => onChange(conditions.filter((_, idx) => idx !== i))

  return (
    <div>
      <div className="flex gap-2 items-center mb-2 flex-wrap">
        <span className="text-xs text-slate-600 dark:text-slate-300">Match</span>
        <MatchSelect value={matchMode} onChange={onMatchModeChange} label="Match" />
        <Button size="sm" onClick={() => onChange([...conditions, { ...emptyCondition }])}>+ Add condition</Button>
        <Button size="sm" variant="secondary" title="Conditions in brackets, with their own ALL / ANY"
                onClick={() => onChange([...conditions, emptyGroup()])}>+ Add group</Button>
      </div>
      {conditions.map((item, i) => isGroupRow(item) ? (
        <div key={i} role="group" aria-label={`Group ${i + 1}`}
             className="mb-2 pl-3 pr-2 py-2 border-l-4 border-indigo-300 dark:border-indigo-700 bg-slate-50 dark:bg-slate-800/50 rounded-r">
          <div className="flex gap-2 items-center mb-2 flex-wrap">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Group: match</span>
            <MatchSelect value={item.matchMode} label="Group match"
                         onChange={matchMode => replace(i, { ...item, matchMode })} />
            <Button size="sm" onClick={() => replace(i, { ...item, conditions: [...item.conditions, { ...emptyCondition }] })}>
              + Add condition
            </Button>
            <Button size="sm" variant="danger" aria-label="Remove group" onClick={() => remove(i)}>Remove group</Button>
          </div>
          {item.conditions.map((row, j) => (
            <ConditionRowEditor key={j} c={row} ctx={ctx}
              onChange={next => replace(i, { ...item, conditions: item.conditions.map((r, k) => k === j ? next : r) })}
              onRemove={() => {
                const rest = item.conditions.filter((_, k) => k !== j)
                if (rest.length === 0) remove(i)
                else replace(i, { ...item, conditions: rest })
              }}
            />
          ))}
        </div>
      ) : (
        <ConditionRowEditor key={i} c={item} ctx={ctx} onChange={next => replace(i, next)} onRemove={() => remove(i)} />
      ))}
      {conditions.length === 0 && (
        <div className="text-xs text-slate-400">No conditions yet — add one to filter.</div>
      )}
    </div>
  )
}
