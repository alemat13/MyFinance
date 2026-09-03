import { Fragment, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Transaction, TransactionSplit, GlobalSplitWeight,
  Account, Category, User, FilterField, TransactionSearchRequest,
  fetchAccounts, fetchCategories, fetchUsers, fetchSplitWeights, searchTransactions,
} from '../api/client'
import TransactionDetail from './TransactionDetail'
import CategoryPicker from './CategoryPicker'
import { Button, Input, Select, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, Badge, CategoryBadge } from './ui'
import { formatMoney } from '../utils/currency'
import { getParam, patchQueryParams } from '../utils/urlState'
import { sharedShareFor, formatDateGroupHeader } from '../utils/transactions'

interface Props {
  onBack: () => void
  selectedUserId: number | null
}

type FilterMode = 'simple' | 'advanced'

interface ConditionRow {
  field: FilterField
  operator: string
  value: string
  value2: string
}

const OPERATORS_BY_FIELD: Record<FilterField, { value: string; label: string }[]> = {
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

const FIELD_LABELS: Record<FilterField, string> = {
  payee: 'Payee', memo: 'Memo', amount: 'Amount', date: 'Date',
  account_id: 'Account', category_id: 'Category',
}

const emptyCondition: ConditionRow = { field: 'payee', operator: 'contains', value: '', value2: '' }

const SORT_BY_VALUES = ['date', 'amount', 'payee', 'created_at'] as const
const SORT_DIR_VALUES = ['asc', 'desc'] as const
const PAGE_SIZE_VALUES = [25, 50, 100] as const

function loadInitialMode(): FilterMode {
  return getParam('mode') === 'advanced' ? 'advanced' : 'simple'
}

function loadInitialConditions(): ConditionRow[] {
  const raw = getParam('conditions')
  if (!raw) return []
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c): c is ConditionRow =>
      c && typeof c === 'object' && typeof c.field === 'string' && typeof c.operator === 'string')
  } catch {
    return []
  }
}

function loadInitialInt(name: string, fallback: number): number {
  const parsed = parseInt(getParam(name) ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function loadInitialPageSize(): number {
  const parsed = parseInt(getParam('page_size') ?? '', 10)
  return (PAGE_SIZE_VALUES as readonly number[]).includes(parsed) ? parsed : 50
}

function loadInitialSortBy(): typeof SORT_BY_VALUES[number] {
  const val = getParam('sort_by')
  return (SORT_BY_VALUES as readonly string[]).includes(val ?? '') ? (val as typeof SORT_BY_VALUES[number]) : 'date'
}

function loadInitialSortDir(): typeof SORT_DIR_VALUES[number] {
  const val = getParam('sort_dir')
  return (SORT_DIR_VALUES as readonly string[]).includes(val ?? '') ? (val as typeof SORT_DIR_VALUES[number]) : 'desc'
}

const splitsDisplay = (splits: TransactionSplit[], currency: string) => {
  if (splits.length === 0) return <span className="text-slate-400">—</span>
  return splits.map(s => `${s.user_name} ${formatMoney(s.share_amount, currency)}`).join(' / ')
}

export default function TransactionsPage({ onBack, selectedUserId }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [globalWeights, setGlobalWeights] = useState<GlobalSplitWeight[]>([])
  const [detailTarget, setDetailTarget] = useState<number | 'new' | null>(() => loadInitialInt('transaction', 0) || null)

  const [mode, setMode] = useState<FilterMode>(loadInitialMode)
  const [searchText, setSearchText] = useState(() => getParam('q') ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(() => getParam('q') ?? '')
  const [dateFrom, setDateFrom] = useState(() => getParam('date_from') ?? '')
  const [dateTo, setDateTo] = useState(() => getParam('date_to') ?? '')
  const [filterAccountId, setFilterAccountId] = useState(() => loadInitialInt('account_id', 0))
  const [filterCategoryId, setFilterCategoryId] = useState(() => loadInitialInt('category_id', 0))
  const [amountMin, setAmountMin] = useState(() => getParam('amount_min') ?? '')
  const [amountMax, setAmountMax] = useState(() => getParam('amount_max') ?? '')
  const [conditions, setConditions] = useState<ConditionRow[]>(loadInitialConditions)
  const [debouncedConditions, setDebouncedConditions] = useState<ConditionRow[]>(loadInitialConditions)
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(() => (getParam('match') === 'any' ? 'any' : 'all'))
  const [page, setPage] = useState(() => loadInitialInt('page', 1))
  const [pageSize, setPageSize] = useState(loadInitialPageSize)
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'payee' | 'created_at'>(loadInitialSortBy)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(loadInitialSortDir)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const loadMeta = () => {
    Promise.all([
      fetchAccounts(selectedUserId ?? undefined),
      fetchCategories(),
      fetchUsers(),
      fetchSplitWeights(),
    ])
      .then(([accts, cats, users, weights]) => {
        setAccounts(accts)
        setCategories(cats)
        setAllUsers(users)
        setGlobalWeights(weights)
      })
      .catch(err => { console.error(err); setError(err.message) })
  }

  useEffect(loadMeta, [selectedUserId])

  const coerceConditionValue = (field: FilterField, value: string): string | number => {
    if (field === 'amount' || field === 'account_id' || field === 'category_id') return parseFloat(value)
    return value
  }

  const buildSearchRequest = (): TransactionSearchRequest => {
    const base: TransactionSearchRequest = {
      user_id: selectedUserId ?? undefined,
      page, page_size: pageSize, sort_by: sortBy, sort_dir: sortDir,
    }
    if (mode === 'advanced') {
      return {
        ...base,
        match_mode: matchMode,
        conditions: debouncedConditions
          .filter(c => c.value !== '')
          .map(c => ({
            field: c.field,
            operator: c.operator,
            value: coerceConditionValue(c.field, c.value),
            value2: c.operator === 'between' && c.value2 !== '' ? coerceConditionValue(c.field, c.value2) : undefined,
          })),
      }
    }
    return {
      ...base,
      search: debouncedSearch || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      account_id: filterAccountId || undefined,
      category_id: filterCategoryId || undefined,
      amount_min: amountMin !== '' ? parseFloat(amountMin) : undefined,
      amount_max: amountMax !== '' ? parseFloat(amountMax) : undefined,
    }
  }

  const loadTransactions = () => {
    setLoading(true)
    searchTransactions(buildSearchRequest())
      .then(res => {
        setTransactions(res.items)
        setTotal(res.total)
        setTotalPages(res.total_pages)
      })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(loadTransactions, [
    selectedUserId, mode, debouncedSearch, dateFrom, dateTo, filterAccountId, filterCategoryId,
    amountMin, amountMax, JSON.stringify(debouncedConditions), matchMode, page, pageSize, sortBy, sortDir,
  ])

  useEffect(() => {
    const common: Record<string, string | undefined> = {
      mode: mode === 'simple' ? undefined : mode,
      page: page === 1 ? undefined : String(page),
      page_size: pageSize === 50 ? undefined : String(pageSize),
      sort_by: sortBy === 'date' ? undefined : sortBy,
      sort_dir: sortDir === 'desc' ? undefined : sortDir,
    }
    if (mode === 'advanced') {
      patchQueryParams({
        ...common,
        q: undefined, date_from: undefined, date_to: undefined,
        account_id: undefined, category_id: undefined, amount_min: undefined, amount_max: undefined,
        match: matchMode === 'all' ? undefined : matchMode,
        conditions: debouncedConditions.length === 0 ? undefined : encodeURIComponent(JSON.stringify(debouncedConditions)),
      })
    } else {
      patchQueryParams({
        ...common,
        match: undefined, conditions: undefined,
        q: debouncedSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        account_id: filterAccountId ? String(filterAccountId) : undefined,
        category_id: filterCategoryId ? String(filterCategoryId) : undefined,
        amount_min: amountMin || undefined,
        amount_max: amountMax || undefined,
      })
    }
  }, [
    mode, debouncedSearch, dateFrom, dateTo, filterAccountId, filterCategoryId,
    amountMin, amountMax, JSON.stringify(debouncedConditions), matchMode, page, pageSize, sortBy, sortDir,
  ])

  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(searchText); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [searchText])

  useEffect(() => {
    const id = setTimeout(() => { setDebouncedConditions(conditions); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [JSON.stringify(conditions)])

  const clearSimpleFilters = () => {
    setSearchText('')
    setDebouncedSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterAccountId(0)
    setFilterCategoryId(0)
    setAmountMin('')
    setAmountMax('')
    setPage(1)
  }

  const addCondition = () => setConditions([...conditions, { ...emptyCondition }])
  const removeCondition = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i))
  const updateConditionField = (i: number, field: FilterField) => {
    setConditions(conditions.map((c, idx) => idx === i
      ? { field, operator: OPERATORS_BY_FIELD[field][0].value, value: '', value2: '' }
      : c))
  }
  const updateConditionOperator = (i: number, operator: string) => {
    setConditions(conditions.map((c, idx) => idx === i ? { ...c, operator } : c))
  }
  const updateConditionValue = (i: number, key: 'value' | 'value2', value: string) => {
    setConditions(conditions.map((c, idx) => idx === i ? { ...c, [key]: value } : c))
  }

  const openDetail = (id: number) => {
    setDetailTarget(id)
    patchQueryParams({ transaction: String(id) })
  }

  const openNew = () => setDetailTarget('new')

  const closeDetail = () => {
    setDetailTarget(null)
    patchQueryParams({ transaction: undefined })
  }

  const groupByDate = sortBy === 'date'

  const acctOptions = accounts.map(a => ({ value: a.id, label: a.name }))

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-accent hover:underline text-sm mb-4 cursor-pointer">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transactions</h2>
        <Button onClick={openNew}>+ New Transaction</Button>
      </div>

      <div className="p-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex gap-2 items-center mb-2">
          <Button size="sm" variant={mode === 'simple' ? 'primary' : 'secondary'} onClick={() => { setMode('simple'); setPage(1) }}>Simple</Button>
          <Button size="sm" variant={mode === 'advanced' ? 'primary' : 'secondary'} onClick={() => { setMode('advanced'); setPage(1) }}>Advanced</Button>
        </div>

        {mode === 'simple' ? (
          <div className="flex gap-2 flex-wrap items-end">
            <Input placeholder="Search payee/memo" value={searchText} onChange={e => setSearchText(e.target.value)} />
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
            <Select value={filterAccountId} onChange={e => { setFilterAccountId(parseInt(e.target.value) || 0); setPage(1) }} className="min-w-[140px]">
              <option value={0}>Account</option>
              {acctOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <CategoryPicker
              categories={categories}
              value={filterCategoryId || null}
              onChange={id => { setFilterCategoryId(id ?? 0); setPage(1) }}
              placeholder="Category"
              className="min-w-[140px]"
            />
            <Input placeholder="Min amount" type="number" step="0.01" value={amountMin} onChange={e => { setAmountMin(e.target.value); setPage(1) }} className="w-[110px]" />
            <Input placeholder="Max amount" type="number" step="0.01" value={amountMax} onChange={e => { setAmountMax(e.target.value); setPage(1) }} className="w-[110px]" />
            <Button size="sm" variant="secondary" onClick={clearSimpleFilters}>Clear</Button>
          </div>
        ) : (
          <div>
            <div className="flex gap-2 items-center mb-2">
              <span className="text-xs text-slate-600 dark:text-slate-300">Match</span>
              <Select value={matchMode} onChange={e => { setMatchMode(e.target.value as 'all' | 'any'); setPage(1) }}>
                <option value="all">ALL (AND)</option>
                <option value="any">ANY (OR)</option>
              </Select>
              <Button size="sm" onClick={addCondition}>+ Add condition</Button>
            </div>
            {conditions.map((c, i) => (
              <div key={i} className="flex gap-2 items-center mb-1.5">
                <Select value={c.field} onChange={e => updateConditionField(i, e.target.value as FilterField)} className="min-w-[110px]">
                  {(Object.keys(OPERATORS_BY_FIELD) as FilterField[]).map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                </Select>
                <Select value={c.operator} onChange={e => updateConditionOperator(i, e.target.value)} className="min-w-[120px]">
                  {OPERATORS_BY_FIELD[c.field].map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                </Select>
                {c.field === 'account_id' ? (
                  <Select value={c.value} onChange={e => updateConditionValue(i, 'value', e.target.value)} className="min-w-[140px]">
                    <option value="">Account</option>
                    {acctOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : c.field === 'category_id' ? (
                  <CategoryPicker
                    categories={categories}
                    value={c.value ? parseInt(c.value) : null}
                    onChange={id => updateConditionValue(i, 'value', id != null ? String(id) : '')}
                    placeholder="Category"
                    className="min-w-[140px]"
                  />
                ) : (
                  <Input
                    type={c.field === 'amount' ? 'number' : c.field === 'date' ? 'date' : 'text'}
                    step={c.field === 'amount' ? '0.01' : undefined}
                    value={c.value}
                    onChange={e => updateConditionValue(i, 'value', e.target.value)}
                    className="w-[130px]"
                  />
                )}
                {c.operator === 'between' && (
                  <Input
                    type={c.field === 'amount' ? 'number' : 'date'}
                    step={c.field === 'amount' ? '0.01' : undefined}
                    value={c.value2}
                    onChange={e => updateConditionValue(i, 'value2', e.target.value)}
                    className="w-[130px]"
                  />
                )}
                <Button size="sm" variant="danger" onClick={() => removeCondition(i)}>×</Button>
              </div>
            ))}
            {conditions.length === 0 && (
              <div className="text-xs text-slate-400">No conditions yet — add one to filter.</div>
            )}
          </div>
        )}
      </div>

      <StatusMessage loading={loading} />

      {!loading && (
        <Table>
          <Thead>
            <Tr>
              <Th>Payee</Th>
              <Th>Category</Th>
              <Th>Account</Th>
              <Th className="text-right">Amount</Th>
              <Th>Split</Th>
            </Tr>
          </Thead>
          <Tbody>
            {transactions.length === 0 && (
              <Tr><Td colSpan={5} className="text-center py-5 text-slate-400">No transactions match your filters</Td></Tr>
            )}
            {transactions.map((t, idx) => {
              const showDateHeader = groupByDate && (idx === 0 || transactions[idx - 1].date !== t.date)
              return (
              <Fragment key={t.id}>
              {showDateHeader && (
                <Tr className="hover:bg-transparent bg-slate-100 dark:bg-slate-800/70">
                  <Td colSpan={5} className="py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatDateGroupHeader(t.date)}
                  </Td>
                </Tr>
              )}
              <Tr
                onClick={() => openDetail(t.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t.id) } }}
                role="button"
                tabIndex={0}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <Td>{t.payee}</Td>
                <Td><CategoryBadge name={t.category_name} color={t.category_color} icon={t.category_icon} /></Td>
                <Td>{t.account_name}</Td>
                <Td className={`text-right ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatMoney(t.amount, t.currency)}
                  {sharedShareFor(t, selectedUserId, accounts) !== null && (
                    <div className="mt-0.5">
                      <Badge variant="info">Shared · your share: {formatMoney(sharedShareFor(t, selectedUserId, accounts)!, t.currency)}</Badge>
                    </div>
                  )}
                </Td>
                <Td className="text-xs">{splitsDisplay(t.splits, t.currency)}</Td>
              </Tr>
              </Fragment>
              )
            })}
          </Tbody>
        </Table>
      )}

      {!loading && (
        <div className="flex justify-between items-center mt-2 text-sm text-slate-600 dark:text-slate-300">
          <span>{total} result{total !== 1 ? 's' : ''}</span>
          <div className="flex gap-2 items-center">
            <Select value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setPage(1) }}>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </Select>
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span>Page {page} / {totalPages}</span>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {detailTarget !== null && (
        <TransactionDetail
          key={detailTarget === 'new' ? 'new' : detailTarget}
          transactionId={detailTarget === 'new' ? null : detailTarget}
          accounts={accounts}
          categories={categories}
          allUsers={allUsers}
          globalWeights={globalWeights}
          selectedUserId={selectedUserId}
          onClose={closeDetail}
          onSaved={() => { closeDetail(); loadTransactions() }}
          onDeleted={() => { closeDetail(); loadTransactions() }}
        />
      )}
    </div>
  )
}
