import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Link2 } from 'lucide-react'
import {
  Transaction, GlobalSplitWeight,
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
import SavedFilters, { CurrentFilter } from './SavedFilters'
import { Button, Input, Select, StatusMessage, BackButton, NumberInput, parseNumber } from './ui'
import { formatMoney } from '../utils/currency'
import { getParam, patchQueryParams } from '../utils/urlState'
import { UNCATEGORIZED_ID } from '../utils/categoryHierarchy'
import { UNTAGGED_ID, joinTagNames } from '../utils/tags'
import { isAdminMode } from '../utils/admin'
import { RuleDraft, simpleFiltersToConditions } from '../utils/rules'
import { myShareFor, balanceFor } from '../utils/transactions'
import { useToast } from '../context/ToastContext'
import { useIsMobile } from '../hooks/useMediaQuery'
import { buildCsv } from '../utils/csv'
import { buildXlsxBlob } from '../utils/xlsx'
import { downloadBlob } from '../utils/download'
import {
  FilterMode, SORT_DIR_STORAGE_KEY, loadInitialMode, loadInitialConditions, loadInitialHistoryGroup, loadInitialInt, loadInitialIds, savedIds, idsToSaved, loadInitialPageSize, loadInitialSortBy, loadInitialSortDir,
} from './transactions/initialState'
import TransactionCardList from './transactions/TransactionCardList'
import TransactionTable from './transactions/TransactionTable'

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

  // Searches can overlap (a filter changed while the last one was in flight)
  // and finish out of order: only the latest one may fill the list, or an
  // older filter's rows would replace the current one's.
  const latestSearch = useRef(0)

  const loadTransactions = () => {
    const searchId = ++latestSearch.current
    setLoading(true)
    searchTransactions(buildSearchRequest())
      .then(res => {
        if (searchId !== latestSearch.current) return
        setTransactions(res.items)
        setTotal(res.total)
        setTotalPages(res.total_pages)
        setSelectedIds(new Set())
        setSearchError(null)
      })
      .catch(err => {
        if (searchId !== latestSearch.current) return
        console.error(err)
        setTransactions([])
        setTotal(0)
        setTotalPages(1)
        setSelectedIds(new Set())
        setSearchError(err.message)
      })
      .finally(() => {
        if (searchId === latestSearch.current) setLoading(false)
      })
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
            <Input placeholder="Search payee/memo" title="* matches any characters, ? exactly one" value={searchText} onChange={e => setSearchText(e.target.value)} />
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
        <TransactionCardList
          transactions={transactions}
          groupByDate={groupByDate}
          selectedUserId={selectedUserId}
          allAccounts={allAccounts}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onToggleReconciled={toggleReconciled}
          onOpen={openDetail}
          sumByCurrency={sumByCurrency}
        />
      )}

      {!loading && !isMobile && (
        <TransactionTable
          transactions={transactions}
          groupByDate={groupByDate}
          selectedUserId={selectedUserId}
          allAccounts={allAccounts}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onToggleReconciled={toggleReconciled}
          onOpen={openDetail}
          sumByCurrency={sumByCurrency}
          allSelected={allSelected}
          onToggleSelectAll={toggleSelectAll}
        />
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
