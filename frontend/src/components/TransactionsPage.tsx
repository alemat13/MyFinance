import { Fragment, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Flag, Link2 } from 'lucide-react'
import {
  Transaction, TransactionSplit, GlobalSplitWeight,
  Account, Category, User, Tag, TransactionSearchRequest, SavedFilter, HistoryGroupRef,
  fetchAccounts, fetchCategories, fetchUsers, fetchSplitWeights, fetchTags, searchTransactions, updateTransaction,
} from '../api/client'
import TransactionDetail from './TransactionDetail'
import BulkEditModal from './BulkEditModal'
import BulkDeleteModal from './BulkDeleteModal'
import CategorizeModal from './CategorizeModal'
import RulesApplyModal from './RulesApplyModal'
import LinkTransactionsModal from './LinkTransactionsModal'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import TransactionConditions, { ConditionRow, SEARCH_ONLY_FIELDS, conditionsToFilters } from './TransactionConditions'
import ExportMenu from './ExportMenu'
import WhatsAppIcon from './WhatsAppIcon'
import { whatsAppListShareUrl } from '../utils/whatsapp'
import TagChips from './TagChips'
import SavedFilters, { CurrentFilter } from './SavedFilters'
import { Button, IconButton, Input, Select, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, CategoryBadge, BackButton, ConfirmDialog, Card, NumberInput, parseNumber } from './ui'
import { formatMoney } from '../utils/currency'
import { getParam, patchQueryParams } from '../utils/urlState'
import { UNCATEGORIZED_ID } from '../utils/categoryHierarchy'
import { UNTAGGED_ID, joinTagNames } from '../utils/tags'
import { isAdminMode } from '../utils/admin'
import { RuleDraft, simpleFiltersToConditions } from '../utils/rules'
import { myShareFor, balanceFor, formatDateGroupHeader, checkpointPeriodLabel } from '../utils/transactions'
import { useToast } from '../context/ToastContext'
import { useIsMobile } from '../hooks/useMediaQuery'
import { buildCsv } from '../utils/csv'
import { buildXlsxBlob } from '../utils/xlsx'
import { downloadBlob } from '../utils/download'

interface Props {
  onBack: () => void
  selectedUserId: number | null
  // Where "Categorize" sends the user when no model has been trained yet.
  onOpenCategorizer: () => void
  // Where "Apply rules" sends the user when no rule exists yet.
  onOpenRules?: () => void
  // "Create rule": opens the rule editor with the current filters as conditions.
  onCreateRule?: (draft: RuleDraft) => void
}

type FilterMode = 'simple' | 'advanced'

const SORT_BY_VALUES = ['date', 'amount', 'payee', 'created_at'] as const
const SORT_DIR_VALUES = ['asc', 'desc'] as const
const PAGE_SIZE_VALUES = [25, 50, 100] as const
// The date order picked with the Newest/Oldest first toggle, remembered across visits.
const SORT_DIR_STORAGE_KEY = 'transactionsSortDir'

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

// The History entry whose transactions the screen is limited to, if it was
// opened from History's "Open in Transactions".
function loadInitialHistoryGroup(): HistoryGroupRef | null {
  const raw = getParam('history_group')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed?.first_id === 'number' && typeof parsed?.last_id === 'number' ? parsed : null
  } catch {
    return null
  }
}

function loadInitialInt(name: string, fallback: number): number {
  const parsed = parseInt(getParam(name) ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

// An id list param ("3,5"), which an older single-id link still reads as.
function loadInitialIds(name: string): number[] {
  return (getParam(name) ?? '').split(',').map(v => parseInt(v, 10)).filter(n => Number.isFinite(n) && n !== 0)
}

/** A saved filter's account/category: one id (0 for none) or a list. */
const savedIds = (v: number | number[] | undefined): number[] =>
  Array.isArray(v) ? v : v ? [v] : []
/** The other way round, so a filter of one id saves the way it always did. */
const idsToSaved = (ids: number[]): number | number[] => ids.length === 0 ? 0 : ids.length === 1 ? ids[0] : ids

function loadInitialPageSize(): number {
  const parsed = parseInt(getParam('page_size') ?? '', 10)
  return (PAGE_SIZE_VALUES as readonly number[]).includes(parsed) ? parsed : 50
}

function loadInitialSortBy(): typeof SORT_BY_VALUES[number] {
  const val = getParam('sort_by')
  return (SORT_BY_VALUES as readonly string[]).includes(val ?? '') ? (val as typeof SORT_BY_VALUES[number]) : 'date'
}

function loadInitialSortDir(): typeof SORT_DIR_VALUES[number] {
  let val = getParam('sort_dir')
  if (val === null) {
    try { val = localStorage.getItem(SORT_DIR_STORAGE_KEY) } catch { val = null }
  }
  return (SORT_DIR_VALUES as readonly string[]).includes(val ?? '') ? (val as typeof SORT_DIR_VALUES[number]) : 'desc'
}

const splitsDisplay = (splits: TransactionSplit[], currency: string) => {
  if (splits.length === 0) return <span className="text-slate-400">—</span>
  return splits.map(s => `${s.user_name} ${formatMoney(s.share_amount, currency)}`).join(' / ')
}

// Marks a checkpoint: a row stating what its account is worth, whose amount
// is worked out from that value.
function CheckpointIcon({ since }: { since?: string | null }) {
  return (
    <span title={`Checkpoint: gain or loss ${checkpointPeriodLabel(since)}`} className="inline-flex align-[-2px] text-accent mx-1">
      <Flag size={14} aria-label="Checkpoint" />
    </span>
  )
}

// The period a checkpoint's amount covers, on its own line under the payee.
function CheckpointPeriod({ since, className = '' }: { since?: string | null; className?: string }) {
  return (
    <div className={`text-xs text-slate-500 dark:text-slate-400 ${className}`} data-testid="checkpoint-period">
      Gain/loss {checkpointPeriodLabel(since)}
    </div>
  )
}

// Marks a transaction that belongs to a group of linked ones; the group itself
// is shown in the detail panel.
function LinkedIcon() {
  return (
    <span title="Linked to other transactions" className="inline-flex align-[-2px] text-accent mx-1">
      <Link2 size={14} aria-label="Linked" />
    </span>
  )
}

export default function TransactionsPage({ onBack, selectedUserId, onOpenCategorizer, onOpenRules, onCreateRule }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // A failed search (a filter the server refuses) is shown above the list
  // rather than in place of the page, so the filter stays there to fix or clear.
  const [searchError, setSearchError] = useState<string | null>(null)
  const [globalWeights, setGlobalWeights] = useState<GlobalSplitWeight[]>([])
  const [detailTarget, setDetailTarget] = useState<number | 'new' | null>(() => loadInitialInt('transaction', 0) || null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [categorizeOpen, setCategorizeOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [adminMode] = useState(isAdminMode)
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)

  const [mode, setMode] = useState<FilterMode>(loadInitialMode)
  const [searchText, setSearchText] = useState(() => getParam('q') ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(() => getParam('q') ?? '')
  const [dateFrom, setDateFrom] = useState(() => getParam('date_from') ?? '')
  const [dateTo, setDateTo] = useState(() => getParam('date_to') ?? '')
  const [filterAccountIds, setFilterAccountIds] = useState<number[]>(() => loadInitialIds('account_id'))
  // UNCATEGORIZED_ID among them stands for the transactions with no category.
  const [filterCategoryIds, setFilterCategoryIds] = useState<number[]>(() => loadInitialIds('category_id'))
  const [filterTagId, setFilterTagId] = useState(() => loadInitialInt('tag_id', 0))
  const [amountMin, setAmountMin] = useState(() => getParam('amount_min') ?? '')
  const [amountMax, setAmountMax] = useState(() => getParam('amount_max') ?? '')
  const [filterReconciled, setFilterReconciled] = useState(() => getParam('reconciled') ?? '')
  const [historyGroup, setHistoryGroup] = useState<HistoryGroupRef | null>(loadInitialHistoryGroup)
  const [conditions, setConditions] = useState<ConditionRow[]>(loadInitialConditions)
  const [debouncedConditions, setDebouncedConditions] = useState<ConditionRow[]>(loadInitialConditions)
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(() => (getParam('match') === 'any' ? 'any' : 'all'))
  const [page, setPage] = useState(() => loadInitialInt('page', 1))
  const [pageSize, setPageSize] = useState(loadInitialPageSize)
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'payee' | 'created_at'>(loadInitialSortBy)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(loadInitialSortDir)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const { showToast } = useToast()
  const isMobile = useIsMobile()

  const loadMeta = () => {
    Promise.all([
      fetchAccounts(selectedUserId ?? undefined),
      fetchAccounts(),
      fetchCategories(),
      fetchUsers(),
      fetchSplitWeights(),
      fetchTags(),
    ])
      .then(([accts, allAccts, cats, users, weights, tagList]) => {
        setAccounts(accts)
        setAllAccounts(allAccts)
        setCategories(cats)
        setAllUsers(users)
        setGlobalWeights(weights)
        setTags(tagList)
      })
      .catch(err => { console.error(err); setError(err.message) })
  }

  useEffect(loadMeta, [selectedUserId])

  const buildSearchRequest = (): TransactionSearchRequest => {
    const base: TransactionSearchRequest = {
      user_id: selectedUserId ?? undefined,
      page, page_size: pageSize, sort_by: sortBy, sort_dir: sortDir,
      history_group: historyGroup ?? undefined,
    }
    if (mode === 'advanced') {
      return { ...base, match_mode: matchMode, conditions: conditionsToFilters(debouncedConditions) }
    }
    return {
      ...base,
      search: debouncedSearch || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      account_ids: filterAccountIds.length > 0 ? filterAccountIds : undefined,
      category_ids: filterCategoryIds.some(id => id > 0) ? filterCategoryIds.filter(id => id > 0) : undefined,
      uncategorized: filterCategoryIds.includes(UNCATEGORIZED_ID) || undefined,
      tag_id: filterTagId > 0 ? filterTagId : undefined,
      untagged: filterTagId === UNTAGGED_ID || undefined,
      amount_min: amountMin !== '' ? parseFloat(amountMin) : undefined,
      amount_max: amountMax !== '' ? parseFloat(amountMax) : undefined,
      reconciled: filterReconciled === '' ? undefined : filterReconciled === 'true',
    }
  }

  const loadTransactions = () => {
    setLoading(true)
    searchTransactions(buildSearchRequest())
      .then(res => {
        setTransactions(res.items)
        setTotal(res.total)
        setTotalPages(res.total_pages)
        setSelectedIds(new Set())
        setSearchError(null)
      })
      .catch(err => {
        console.error(err)
        setTransactions([])
        setTotal(0)
        setTotalPages(1)
        setSelectedIds(new Set())
        setSearchError(err.message)
      })
      .finally(() => setLoading(false))
  }

  const buildExportData = (items: Transaction[]) => {
    const headers = [
      'ID', 'Date', 'Payee', 'Memo', 'Amount', 'Currency', 'Account', 'Category',
      'Accounting Month', 'Reconciled', 'Divide Group ID', 'Tags', 'Checkpoint Value',
      ...allUsers.map(u => `Weight ${u.name}`),
      ...allUsers.map(u => `Share ${u.name}`),
      ...allUsers.map(u => `Balance ${u.name}`),
    ]
    const rows = items.map(t => [
      t.id, t.date, t.payee, t.memo ?? '', t.amount, t.currency, t.account_name, t.category_name ?? '',
      t.accounting_month, t.reconciled ? 'Yes' : 'No', t.divide_group_id ?? '', joinTagNames(t.tags),
      t.checkpoint_value ?? '',
      ...allUsers.map(u => t.splits.find(s => s.user_id === u.id)?.weight ?? ''),
      ...allUsers.map(u => myShareFor(t, u.id)),
      ...allUsers.map(u => balanceFor(t, u.id, allAccounts)),
    ])
    return { headers, rows }
  }

  const handleExport = (format: 'csv' | 'xlsx') => {
    setExporting(true)
    searchTransactions({ ...buildSearchRequest(), unpaginated: true })
      .then(async res => {
        const { headers, rows } = buildExportData(res.items)
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
        if (format === 'csv') {
          const blob = new Blob([buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' })
          downloadBlob(blob, `myfinance-transactions-${timestamp}.csv`)
        } else {
          const blob = await buildXlsxBlob(headers, rows, {
            Date: 'dd/mm/yyyy', 'Accounting Month': 'mm/yyyy',
          })
          downloadBlob(blob, `myfinance-transactions-${timestamp}.xlsx`)
        }
      })
      .catch(err => showToast(err.message))
      .finally(() => setExporting(false))
  }

  // Every row the filters match, not just this page, like the export. The tab
  // is opened before the fetch: a window opened after an await is a popup
  // most browsers block.
  const handleWhatsAppShare = () => {
    const win = window.open('', '_blank')
    setSharing(true)
    searchTransactions({ ...buildSearchRequest(), unpaginated: true })
      .then(res => {
        const url = whatsAppListShareUrl(res.items)
        if (win) win.location.href = url
        else window.location.href = url
      })
      .catch(err => { win?.close(); showToast(err.message) })
      .finally(() => setSharing(false))
  }

  useEffect(loadTransactions, [
    selectedUserId, JSON.stringify(historyGroup), mode, debouncedSearch, dateFrom, dateTo, filterAccountIds.join(), filterCategoryIds.join(), filterTagId,
    amountMin, amountMax, filterReconciled, JSON.stringify(debouncedConditions), matchMode, page, pageSize, sortBy, sortDir,
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
        account_id: undefined, category_id: undefined, tag_id: undefined, amount_min: undefined, amount_max: undefined,
        reconciled: undefined,
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
        account_id: filterAccountIds.length > 0 ? filterAccountIds.join(',') : undefined,
        category_id: filterCategoryIds.length > 0 ? filterCategoryIds.join(',') : undefined,
        tag_id: filterTagId ? String(filterTagId) : undefined,
        amount_min: amountMin || undefined,
        amount_max: amountMax || undefined,
        reconciled: filterReconciled || undefined,
      })
    }
  }, [
    mode, debouncedSearch, dateFrom, dateTo, filterAccountIds.join(), filterCategoryIds.join(), filterTagId,
    amountMin, amountMax, filterReconciled, JSON.stringify(debouncedConditions), matchMode, page, pageSize, sortBy, sortDir,
  ])

  useEffect(() => {
    try { localStorage.setItem(SORT_DIR_STORAGE_KEY, sortDir) } catch { /* storage unavailable */ }
  }, [sortDir])

  const toggleSortDir = () => {
    setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    setPage(1)
  }

  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(searchText); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [searchText])

  useEffect(() => {
    const id = setTimeout(() => { setDebouncedConditions(conditions); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [JSON.stringify(conditions)])

  // The filters on screen as a new rule's conditions; null when there is none
  // to start from, since a rule needs at least one.
  const ruleDraft = (): RuleDraft | null => {
    const draft: RuleDraft = mode === 'advanced'
      // A rule cannot test a person's split, share or balance (the import
      // preview runs rules on rows that have none yet), so those are left out.
      ? { conditions: conditionsToFilters(conditions).filter(c => !SEARCH_ONLY_FIELDS.includes(c.field)), match_mode: matchMode }
      : { conditions: simpleFiltersToConditions(buildSearchRequest()), match_mode: 'all' }
    return draft.conditions.length > 0 ? draft : null
  }
  const currentRuleDraft = onCreateRule ? ruleDraft() : null
  const createRuleButton = onCreateRule && (
    <Button size="sm" variant="secondary" disabled={!currentRuleDraft}
            title={currentRuleDraft ? 'New rule matching these filters' : 'Set a filter first'}
            onClick={() => currentRuleDraft && onCreateRule(currentRuleDraft)}>
      Create rule
    </Button>
  )

  // The filter on screen as "Save filter" stores it, with its date order;
  // null when no criterion is set.
  const currentFilter: CurrentFilter = (() => {
    if (mode === 'advanced') {
      return conditions.length > 0
        ? { mode: 'advanced', filters: { match_mode: matchMode, conditions, sort_dir: sortDir } }
        : null
    }
    const filters = {
      search: searchText, date_from: dateFrom, date_to: dateTo,
      account_id: idsToSaved(filterAccountIds), category_id: idsToSaved(filterCategoryIds),
      amount_min: amountMin, amount_max: amountMax, reconciled: filterReconciled,
      // Only when set, so a filter saved before tags existed still reads as active.
      ...(filterTagId ? { tag_id: filterTagId } : {}),
    }
    return Object.values(filters).some(v => v !== '' && v !== 0)
      ? { mode: 'simple', filters: { ...filters, sort_dir: sortDir } }
      : null
  })()

  // Puts a saved filter back on screen, skipping the debounce so the list
  // follows at once.
  const applySavedFilter = (saved: SavedFilter) => {
    if (saved.mode === 'advanced') {
      const rows = (saved.filters.conditions ?? []) as ConditionRow[]
      setConditions(rows)
      setDebouncedConditions(rows)
      setMatchMode(saved.filters.match_mode === 'any' ? 'any' : 'all')
    } else {
      const f = saved.filters
      setSearchText(f.search ?? '')
      setDebouncedSearch(f.search ?? '')
      setDateFrom(f.date_from ?? '')
      setDateTo(f.date_to ?? '')
      setFilterAccountIds(savedIds(f.account_id))
      setFilterCategoryIds(savedIds(f.category_id))
      setFilterTagId(f.tag_id ?? 0)
      setAmountMin(f.amount_min ?? '')
      setAmountMax(f.amount_max ?? '')
      setFilterReconciled(f.reconciled ?? '')
    }
    if (saved.filters.sort_dir === 'asc' || saved.filters.sort_dir === 'desc') setSortDir(saved.filters.sort_dir)
    setMode(saved.mode)
    setPage(1)
  }

  const clearSimpleFilters = () => {
    setSearchText('')
    setDebouncedSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterAccountIds([])
    setFilterCategoryIds([])
    setFilterTagId(0)
    setAmountMin('')
    setAmountMax('')
    setFilterReconciled('')
    setPage(1)
  }

  const clearHistoryGroup = () => {
    setHistoryGroup(null)
    patchQueryParams({ history_group: undefined })
    setPage(1)
  }

  const openDetail = (id: number) => {
    setDetailTarget(id)
    patchQueryParams({ transaction: String(id) })
  }

  const openNew = () => setDetailTarget('new')

  const toggleSelected = (id: number) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = transactions.length > 0 && transactions.every(t => selectedIds.has(t.id))
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(transactions.map(t => t.id)))
  }

  const toggleReconciled = (t: Transaction) => {
    const next = !t.reconciled
    // Optimistic: flip it locally so the icon/row dim instantly with no
    // full-table reload. If the active filter would now exclude this row,
    // drop it from view immediately too, same as a reload would end up
    // doing. Revert (via a real reload) only if the PATCH fails.
    const stillMatchesFilter = filterReconciled === '' || filterReconciled === String(next)
    setTransactions(current => stillMatchesFilter
      ? current.map(row => row.id === t.id ? { ...row, reconciled: next } : row)
      : current.filter(row => row.id !== t.id))
    if (!stillMatchesFilter) setTotal(tot => Math.max(0, tot - 1))
    updateTransaction(t.id, { reconciled: next }, selectedUserId)
      .catch(err => {
        loadTransactions()
        showToast(err.message)
      })
  }

  const closeDetail = () => {
    setDetailTarget(null)
    patchQueryParams({ transaction: undefined })
  }

  const groupByDate = sortBy === 'date'
  const showMyColumns = selectedUserId != null
  const columnCount = showMyColumns ? 8 : 6

  const sumByCurrency = (values: (t: Transaction) => number) => {
    const totals = new Map<string, number>()
    transactions.forEach(t => totals.set(t.currency, (totals.get(t.currency) ?? 0) + values(t)))
    return [...totals.entries()].map(([cur, v]) => formatMoney(v, cur)).join(' / ')
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transactions</h2>
        <div className="flex gap-2">
          <ExportMenu onExport={handleExport} exporting={exporting} />
          <Button onClick={openNew}>+ New Transaction</Button>
        </div>
      </div>

      <div className="p-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex gap-2 items-center flex-wrap mb-2">
          <Button size="sm" variant={mode === 'simple' ? 'primary' : 'secondary'} onClick={() => { setMode('simple'); setPage(1) }}>Simple</Button>
          <Button size="sm" variant={mode === 'advanced' ? 'primary' : 'secondary'} onClick={() => { setMode('advanced'); setPage(1) }}>Advanced</Button>
          <SavedFilters current={currentFilter} onApply={applySavedFilter} />
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={toggleSortDir}
            title="Change the date order"
          >
            {sortDir === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
            {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
          </Button>
        </div>

        {mode === 'simple' ? (
          <div className="flex gap-2 flex-wrap items-end">
            <Input placeholder="Search payee/memo" value={searchText} onChange={e => setSearchText(e.target.value)} />
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
            <AccountPicker
              accounts={accounts}
              value={null}
              onChange={() => {}}
              values={filterAccountIds}
              onChangeMany={ids => { setFilterAccountIds(ids); setPage(1) }}
              placeholder="All accounts"
              className="min-w-[140px]"
            />
            <CategoryPicker
              categories={categories}
              value={null}
              onChange={() => {}}
              values={filterCategoryIds}
              onChangeMany={ids => { setFilterCategoryIds(ids); setPage(1) }}
              anyLabel="All categories"
              className="min-w-[140px]"
            />
            <Select aria-label="Tag" value={filterTagId} onChange={e => { setFilterTagId(parseInt(e.target.value)); setPage(1) }} className="min-w-[130px]">
              <option value={0}>All tags</option>
              <option value={UNTAGGED_ID}>No tag</option>
              {tags.map(t => <option key={t.id} value={t.id}>#{t.name}</option>)}
            </Select>
            <NumberInput placeholder="Min amount" signed value={parseNumber(amountMin)} onValueChange={v => { setAmountMin(v == null ? '' : String(v)); setPage(1) }} className="w-[110px]" />
            <NumberInput placeholder="Max amount" signed value={parseNumber(amountMax)} onValueChange={v => { setAmountMax(v == null ? '' : String(v)); setPage(1) }} className="w-[110px]" />
            <Select value={filterReconciled} onChange={e => { setFilterReconciled(e.target.value); setPage(1) }} className="min-w-[150px]">
              <option value="">Reconciled: any</option>
              <option value="true">Reconciled only</option>
              <option value="false">Unreconciled only</option>
            </Select>
            <Button size="sm" variant="secondary" onClick={clearSimpleFilters}>Clear</Button>
            {createRuleButton}
          </div>
        ) : (
          <>
            <TransactionConditions
              conditions={conditions}
              onChange={setConditions}
              matchMode={matchMode}
              onMatchModeChange={m => { setMatchMode(m); setPage(1) }}
              accounts={accounts}
              categories={categories}
              tags={tags}
              users={allUsers}
            />
            {createRuleButton && <div className="mt-2">{createRuleButton}</div>}
          </>
        )}
      </div>

      {historyGroup && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md bg-accent/10 border border-accent/30 text-sm">
          <span>Showing only the transactions changed by one History entry{!loading ? ` (${total})` : ''}.</span>
          <Button size="sm" variant="secondary" onClick={clearHistoryGroup}>Show all transactions</Button>
        </div>
      )}

      <StatusMessage loading={loading} />
      {!loading && searchError && (
        <p role="alert" className="mb-3 text-sm text-negative">
          This filter could not be applied ({searchError}). Change or clear it to see transactions again.
        </p>
      )}

      {!loading && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded-md bg-accent/10 border border-accent/30">
          <span className="text-sm">{selectedIds.size} selected</span>
          {/* The table header carries this checkbox on desktop; the mobile card
              list has no header, so the selection bar carries it instead — which
              also keeps it off screen until there's a selection to extend. */}
          {isMobile && !allSelected && (
            <Button size="sm" variant="secondary" onClick={toggleSelectAll} aria-label="Select all on this page">Select all</Button>
          )}
          <Button size="sm" onClick={() => setBulkEditOpen(true)}>Bulk Edit</Button>
          <Button size="sm" variant="secondary" onClick={() => setCategorizeOpen(true)}>Categorize</Button>
          <Button size="sm" variant="secondary" onClick={() => setRulesOpen(true)}>Apply rules</Button>
          {selectedIds.size >= 2 && (
            <Button size="sm" variant="secondary" onClick={() => setLinkOpen(true)}>
              <Link2 size={14} /> Link
            </Button>
          )}
          {adminMode && (
            <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>Delete selected</Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
        </div>
      )}

      {!loading && isMobile && (
        <div className="space-y-2">
          {transactions.length === 0 && (
            <div className="text-center py-5 text-sm text-slate-400">No transactions match your filters</div>
          )}
          {transactions.map((t, idx) => {
            const showDateHeader = groupByDate && (idx === 0 || transactions[idx - 1].date !== t.date)
            const myShare = showMyColumns ? myShareFor(t, selectedUserId!) : null
            const balance = showMyColumns ? balanceFor(t, selectedUserId!, allAccounts) : null
            return (
              <Fragment key={t.id}>
                {showDateHeader && (
                  <div className="pt-2 pb-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatDateGroupHeader(t.date)}
                  </div>
                )}
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(t.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t.id) } }}
                  className={`p-3 cursor-pointer ${t.reconciled ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelected(t.id)}
                      onClick={e => e.stopPropagation()}
                      aria-label={`Select transaction ${t.payee}`}
                      className="mt-1.5 shrink-0"
                    />
                    <IconButton
                      aria-label={t.reconciled ? `Mark ${t.payee} as unreconciled` : `Mark ${t.payee} as reconciled`}
                      onClick={e => { e.stopPropagation(); toggleReconciled(t) }}
                      className="p-0.5 mt-0.5 shrink-0"
                    >
                      {t.reconciled
                        ? <CheckCircle2 size={16} className="text-positive" />
                        : <Circle size={16} className="text-slate-300 dark:text-slate-600" />}
                    </IconButton>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {t.link_id != null && <LinkedIcon />}{t.checkpoint_value != null && <CheckpointIcon since={t.checkpoint_since} />}
                          {t.payee}
                        </span>
                        <span className={`shrink-0 font-semibold ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatMoney(t.amount, t.currency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <CategoryBadge name={t.category_name} color={t.category_color} icon={t.category_icon} />
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{t.account_name}</span>
                      </div>
                      {t.checkpoint_value != null && <CheckpointPeriod since={t.checkpoint_since} className="mt-1" />}
                      {t.tags && t.tags.length > 0 && <div className="mt-1"><TagChips tags={t.tags} /></div>}
                      {showMyColumns && (
                        <div className="flex justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                          <span>My share: <span className={myShare! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{formatMoney(myShare!, t.currency)}</span></span>
                          <span>Balance: <span className={balance! >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{formatMoney(balance!, t.currency)}</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </Fragment>
            )
          })}
          {transactions.length > 0 && (
            <div className="flex justify-between text-sm font-semibold pt-2 mt-1 border-t-2 border-slate-300 dark:border-slate-600">
              <span>Total</span>
              <span>{sumByCurrency(t => t.amount)}</span>
            </div>
          )}
        </div>
      )}

      {!loading && !isMobile && (
        <Table>
          <Thead>
            <Tr>
              <Th className="w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all on this page" />
              </Th>
              <Th>Payee</Th>
              <Th>Category</Th>
              <Th>Account</Th>
              <Th className="text-right">Amount</Th>
              {showMyColumns && <Th className="text-right">My share</Th>}
              {showMyColumns && <Th className="text-right">Balance</Th>}
              <Th>Split</Th>
            </Tr>
          </Thead>
          <Tbody>
            {transactions.length === 0 && (
              <Tr><Td colSpan={columnCount} className="text-center py-5 text-slate-400">No transactions match your filters</Td></Tr>
            )}
            {transactions.map((t, idx) => {
              const showDateHeader = groupByDate && (idx === 0 || transactions[idx - 1].date !== t.date)
              return (
              <Fragment key={t.id}>
              {showDateHeader && (
                <Tr className="hover:bg-transparent bg-slate-100 dark:bg-slate-800/70">
                  <Td colSpan={columnCount} className="py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatDateGroupHeader(t.date)}
                  </Td>
                </Tr>
              )}
              <Tr
                onClick={() => openDetail(t.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(t.id) } }}
                role="button"
                tabIndex={0}
                className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${t.reconciled ? 'opacity-60' : ''}`}
              >
                <Td onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={() => toggleSelected(t.id)}
                    aria-label={`Select transaction ${t.payee}`}
                  />
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    <IconButton
                      aria-label={t.reconciled ? `Mark ${t.payee} as unreconciled` : `Mark ${t.payee} as reconciled`}
                      onClick={e => { e.stopPropagation(); toggleReconciled(t) }}
                      className="p-0.5"
                    >
                      {t.reconciled
                        ? <CheckCircle2 size={16} className="text-positive" />
                        : <Circle size={16} className="text-slate-300 dark:text-slate-600" />}
                    </IconButton>
                    {t.payee}
                    {t.link_id != null && <LinkedIcon />}{t.checkpoint_value != null && <CheckpointIcon since={t.checkpoint_since} />}
                  </span>
                  {t.checkpoint_value != null && <CheckpointPeriod since={t.checkpoint_since} className="ml-7 mt-0.5" />}
                  {t.tags && t.tags.length > 0 && <div className="ml-7 mt-0.5"><TagChips tags={t.tags} /></div>}
                </Td>
                <Td><CategoryBadge name={t.category_name} color={t.category_color} icon={t.category_icon} /></Td>
                <Td>{t.account_name}</Td>
                <Td className={`text-right ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatMoney(t.amount, t.currency)}
                </Td>
                {showMyColumns && (() => {
                  const myShare = myShareFor(t, selectedUserId!)
                  const balance = balanceFor(t, selectedUserId!, allAccounts)
                  return (
                    <>
                      <Td className={`text-right ${myShare >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatMoney(myShare, t.currency)}
                      </Td>
                      <Td className={`text-right ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatMoney(balance, t.currency)}
                      </Td>
                    </>
                  )
                })()}
                <Td className="text-xs">{splitsDisplay(t.splits, t.currency)}</Td>
              </Tr>
              </Fragment>
              )
            })}
            {transactions.length > 0 && (
              <Tr className="hover:bg-transparent font-semibold border-t-2 border-slate-300 dark:border-slate-600">
                <Td colSpan={4}>Total</Td>
                <Td className="text-right">{sumByCurrency(t => t.amount)}</Td>
                {showMyColumns && (
                  <>
                    <Td className="text-right">{sumByCurrency(t => myShareFor(t, selectedUserId!))}</Td>
                    <Td className="text-right">{sumByCurrency(t => balanceFor(t, selectedUserId!, allAccounts))}</Td>
                  </>
                )}
                <Td />
              </Tr>
            )}
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

      {!loading && total > 0 && (
        <div className="flex justify-center mt-4">
          <Button size="sm" variant="secondary" onClick={handleWhatsAppShare} disabled={sharing}>
            <span className="text-[#25D366]"><WhatsAppIcon size={16} /></span>
            {sharing ? 'Preparing…' : 'Share on WhatsApp'}
          </Button>
        </div>
      )}

      {detailTarget !== null && (
        <TransactionDetail
          key={detailTarget === 'new' ? 'new' : detailTarget}
          transactionId={detailTarget === 'new' ? null : detailTarget}
          accounts={accounts}
          categories={categories}
          tags={tags}
          onTagCreated={tag => setTags(ts => [...ts, tag].sort((a, b) => a.name.localeCompare(b.name)))}
          allUsers={allUsers}
          globalWeights={globalWeights}
          selectedUserId={selectedUserId}
          onClose={closeDetail}
          onSaved={() => { closeDetail(); loadTransactions() }}
          onDeleted={() => { closeDetail(); loadTransactions() }}
          onNavigateToTransaction={openDetail}
          onLinksChanged={loadTransactions}
        />
      )}

      {categorizeOpen && (
        <CategorizeModal
          transactionIds={[...selectedIds]}
          transactions={transactions.filter(t => selectedIds.has(t.id))}
          selectedUserId={selectedUserId}
          onClose={() => setCategorizeOpen(false)}
          onApplied={() => { setCategorizeOpen(false); setSelectedIds(new Set()); loadTransactions() }}
          onOpenCategorizer={onOpenCategorizer}
        />
      )}

      {linkOpen && (
        <LinkTransactionsModal
          transactions={transactions.filter(t => selectedIds.has(t.id))}
          selectedUserId={selectedUserId}
          onClose={() => setLinkOpen(false)}
          onLinked={() => { setLinkOpen(false); setSelectedIds(new Set()); loadTransactions() }}
        />
      )}

      {rulesOpen && (
        <RulesApplyModal
          transactionIds={[...selectedIds]}
          transactions={transactions.filter(t => selectedIds.has(t.id))}
          allUsers={allUsers}
          selectedUserId={selectedUserId}
          onClose={() => setRulesOpen(false)}
          onApplied={() => { setRulesOpen(false); setSelectedIds(new Set()); loadTransactions() }}
          onOpenRules={onOpenRules}
        />
      )}

      {bulkEditOpen && (
        <BulkEditModal
          transactionIds={[...selectedIds]}
          transactions={transactions.filter(t => selectedIds.has(t.id))}
          accounts={accounts}
          categories={categories}
          tags={tags}
          onTagCreated={tag => setTags(ts => [...ts, tag].sort((a, b) => a.name.localeCompare(b.name)))}
          allUsers={allUsers}
          globalWeights={globalWeights}
          selectedUserId={selectedUserId}
          onClose={() => setBulkEditOpen(false)}
          onSaved={() => { setBulkEditOpen(false); loadTransactions() }}
          searchFilter={allSelected ? buildSearchRequest() : undefined}
          matchingTotal={allSelected ? total : undefined}
          moveAccounts={adminMode ? allAccounts : undefined}
          adminMode={adminMode}
        />
      )}

      {bulkDeleteOpen && (
        <BulkDeleteModal
          transactionIds={[...selectedIds]}
          selectedUserId={selectedUserId}
          onClose={() => setBulkDeleteOpen(false)}
          onDeleted={() => { setBulkDeleteOpen(false); loadTransactions() }}
          searchFilter={allSelected ? buildSearchRequest() : undefined}
          matchingTotal={allSelected ? total : undefined}
        />
      )}

    </div>
  )
}
