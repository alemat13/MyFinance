import { Account, Category, FilterCondition, FilterField } from '../api/client'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import { Button, Select, Input } from './ui'

/** One row of the advanced filter, as the UI holds it: every value a string,
 *  since that is what an `<input>` gives back. `conditionsToFilters()` turns
 *  these into what the API expects. */
export interface ConditionRow {
  field: FilterField
  operator: string
  value: string
  value2: string
}

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
  amount: [
    { value: 'eq', label: '=' },
    { value: 'ne', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'between', label: 'between' },
  ],
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
}

export const FIELD_LABELS: Record<FilterField, string> = {
  payee: 'Payee', memo: 'Memo', amount: 'Amount', date: 'Date',
  account_id: 'Account', category_id: 'Category',
}

export const emptyCondition: ConditionRow = { field: 'payee', operator: 'contains', value: '', value2: '' }

function coerceValue(field: FilterField, value: string): string | number {
  if (field === 'amount' || field === 'account_id' || field === 'category_id') return parseFloat(value)
  return value
}

/** Drops the rows the user started but left empty, so a half-typed condition
 *  never narrows a selection behind their back. */
export function conditionsToFilters(conditions: ConditionRow[]): FilterCondition[] {
  return conditions
    .filter(c => c.value !== '')
    .map(c => ({
      field: c.field,
      operator: c.operator,
      value: coerceValue(c.field, c.value),
      value2: c.operator === 'between' && c.value2 !== '' ? coerceValue(c.field, c.value2) : undefined,
    }))
}

interface Props {
  conditions: ConditionRow[]
  onChange: (rows: ConditionRow[]) => void
  matchMode: 'all' | 'any'
  onMatchModeChange: (mode: 'all' | 'any') => void
  accounts: Account[]
  categories: Category[]
}

/** The advanced-filter condition builder, shared by the Transactions screen
 *  and the auto-categorization screen so a training selection is expressed in
 *  exactly the filters the user already knows. */
export default function TransactionConditions({
  conditions, onChange, matchMode, onMatchModeChange, accounts, categories,
}: Props) {
  const updateField = (i: number, field: FilterField) => {
    onChange(conditions.map((c, idx) => idx === i
      ? { field, operator: OPERATORS_BY_FIELD[field][0].value, value: '', value2: '' }
      : c))
  }
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
            {(Object.keys(OPERATORS_BY_FIELD) as FilterField[]).map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
          </Select>
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
              placeholder="Category"
              className="min-w-[140px]"
            />
          ) : (
            <Input
              type={c.field === 'amount' ? 'number' : c.field === 'date' ? 'date' : 'text'}
              step={c.field === 'amount' ? '0.01' : undefined}
              value={c.value}
              onChange={e => updateValue(i, 'value', e.target.value)}
              className="w-[130px]"
            />
          )}
          {c.operator === 'between' && (
            <Input
              type={c.field === 'amount' ? 'number' : 'date'}
              step={c.field === 'amount' ? '0.01' : undefined}
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
