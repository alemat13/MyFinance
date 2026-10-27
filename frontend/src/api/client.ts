import type { components } from './schema'

type Schemas = components['schemas']

// Most types below are aliases of the ones generated from the backend's
// OpenAPI schema (schema.d.ts, `npm run gen:api`). These two helpers adjust a
// generated type where the frontend says more than the schema can (a literal
// union for a field the backend types as str) or wants a field optional.
type With<T, O> = Omit<T, keyof O> & O
type Loose<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type AccountUser = Schemas['AccountUserOut']

export type AccountSplitWeight = Schemas['AccountSplitWeightOut']

export type AccountSplitWeightCreate = Schemas['AccountSplitWeightUpdateItem']

// last_transaction_date is only filled by GET /api/dashboard (null elsewhere);
// optional so fixtures and hand-built accounts can leave it out.
export type Account = Loose<Schemas['AccountOut'], 'last_transaction_date'>

export type AccountUserCreate = Schemas['AccountUserCreate']

export type AccountCreate = Schemas['AccountCreate']

export type AccountUpdate = Schemas['AccountUpdate']

export type CategorySplit = Schemas['CategorySplitOut']

export type CategorySplitCreate = Schemas['CategorySplitCreate']

export type Category = Loose<Schemas['CategoryOut'], 'color' | 'icon' | 'parent_id' | 'parent_name'>

// `type` stays a plain string: the form holds '' until a type is picked, and
// the backend refuses anything outside CATEGORY_TYPES.
export type CategoryCreate = With<Schemas['CategoryCreate'], { type: string }>

export type CategoryUpdate = With<Schemas['CategoryUpdate'], { type?: string }>

export type GlobalSplitWeight = Schemas['GlobalSplitWeightOut']

export type SplitSource = 'global' | 'account' | 'category' | 'custom'

export type SplitWeightCreate = Schemas['SplitWeightCreate']

export type TransactionSplit = With<Schemas['TransactionSplitOut'], { source: SplitSource }>

export type UserBalance = Schemas['UserBalanceOut']

/** A free label on transactions, many-to-many: a transaction carries any
 *  number of tags. Means nothing to balances, charts or splits. */
export type TagRef = Loose<Schemas['TagRef'], 'color'>

export type Tag = Schemas['TagOut']

// The API always sends every field. The ones listed in Loose are optional
// here only so that fixtures and hand-built transactions need not spell out
// a dozen nulls they do not care about.
export type Transaction = Loose<
  With<Schemas['TransactionOut'], {
    raw_source: 'enable_banking' | 'csv_import' | 'linxo_export' | null
    splits: TransactionSplit[]
    tags: TagRef[]
  }>,
  | 'category_color' | 'category_icon' | 'link_id' | 'tags' | 'checkpoint_value'
  | 'raw_source' | 'raw_label' | 'raw_counterparty' | 'raw_transaction_code'
  | 'raw_merchant_category_code' | 'raw_merchant_location' | 'raw_initiated_date' | 'raw_booking_date'
>

export type TransactionCreate = Schemas['TransactionCreate']

export type TransactionUpdate = With<Schemas['TransactionUpdate'], { split_source?: SplitSource | null }>

// Only include a key here when its section is meant to be applied to every
// selected transaction — an omitted key leaves that field untouched on all
// of them, mirroring the backend's exclude_unset contract.
export type PayeeMode = 'replace' | 'prepend' | 'append' | 'regex'

export type BulkTransactionUpdate = Schemas['BulkTransactionUpdate']

export type BulkUpdateTransactionsResponse = Schemas['BulkUpdateTransactionsResponse']

// A "Divide" splits one transaction's amount into several new transactions
// by category/date — unrelated to split_weights/SplitSource above, which
// divide a transaction's amount among users. No account_id: every part
// stays on the original transaction's account.
export type TransactionDividePart = Schemas['TransactionDividePart']

export type TransactionDivideRequest = Schemas['TransactionDivideRequest']

export type TransactionDivideResponse = With<Schemas['TransactionDivideResponse'], { transactions: Transaction[] }>

export type FilterField = 'payee' | 'memo' | 'raw_label' | 'amount' | 'amount_abs' | 'date' | 'account_id' | 'category_id'
  | 'split_weight' | 'split_share' | 'split_balance' | 'split_share_abs' | 'split_balance_abs' | 'tag_id'
  | 'reconciled' | 'linked' | 'accounting_month_offset' | 'accounting_month' | 'created_at'
  | 'raw_counterparty' | 'raw_transaction_code' | 'raw_merchant_category_code' | 'raw_merchant_location'
  | 'raw_initiated_date' | 'raw_booking_date'

export type FilterCondition = Schemas['FilterCondition-Input']

export type TransactionSearchRequest = Schemas['TransactionSearchRequest']

export type TransactionSearchResponse = With<Schemas['TransactionSearchResponse'], { items: Transaction[] }>

export type User = Schemas['UserOut']

export type UserCreate = Schemas['UserCreate']

export type UserUpdate = Schemas['UserUpdate']

export type DashboardData = With<Schemas['DashboardResponse'], {
  accounts: Account[]
  recent_transactions: Transaction[]
}>

export type ImportDetectResponse = Loose<With<Schemas['ImportDetectResponse'], {
  column_mapping: Record<'date' | 'payee' | 'amount' | 'memo' | 'category' | 'account', string | null>
  file_format: 'csv' | 'qif'
}>, 'file_format'>

export type CategoryChartItem = Schemas['CategoryChartItem']

export type MonthChartItem = Schemas['MonthChartItem']

export type NetMonthChartItem = Schemas['NetMonthChartItem']

export type MonthCategoryChartItem = Schemas['MonthCategoryChartItem']

export type ChartCategoryOut = Schemas['ChartCategoryOut']

export type ParentCategoryOut = Schemas['ParentCategoryOut']

export type ChartsData = Schemas['ChartsResponse']

export interface ImportPreviewRequest {
  account_id: number
  encoding: string
  delimiter: string
  date_format: string
  decimal_separator: string
  date_col: string
  payee_col: string
  amount_col: string
  memo_col?: string | null
  category_col?: string | null
  account_col?: string | null
}

export type ImportPreviewRow = With<Schemas['ImportPreviewRow'], {
  status: 'ok' | 'needs_category' | 'possible_duplicate' | 'error'
  rules: RuleOutcome | null
}>

/** A row as the import commits it: `raw_label` is the file's own payee, sent
 *  separately because a rule may have renamed `payee` in the preview. */
export type ImportCommitRow = Schemas['ImportCommitRow']

export type ImportCommitResponse = Schemas['ImportCommitResponse']

export type BackupImportMode = 'overwrite' | 'partial'

export type ImportSummary = Schemas['ImportSummary']

export type HistoryAction = 'created' | 'updated' | 'deleted'

export type TransactionHistoryEntry = With<Schemas['TransactionHistoryOut'], {
  action: HistoryAction
  changes: Record<string, { old: unknown; new: unknown }> | null
}>

// One History entry's rows: the id range they span plus what they share.
// Sent back as is by fetchHistoryRows(), so every field is required here even
// though the request side of the schema leaves them optional.
export type HistoryGroupRef = With<Schemas['HistoryGroupRef'], {
  action: HistoryAction
  source: string | null
  changed_by_user_id: number | null
  batch_id: string | null
}>

// One line of the History timeline. count 1: a single change, with its own
// snapshot and changes ({old, new} per field). count > 1: the rows one action
// wrote, `changes` then holding what they share ({new} when every row got the
// same value, {new: null, mixed: true} when not, {added, removed} for tags).
export type HistoryEntry = With<Schemas['HistoryEntryOut'], {
  action: HistoryAction
  changes: Record<string, { old?: unknown; new?: unknown; mixed?: boolean; added?: string[]; removed?: string[] }> | null
}>

export type HistoryPage = With<Schemas['HistoryPageOut'], { items: HistoryEntry[] }>

export type HistoryRows = With<Schemas['HistoryRowsOut'], { items: TransactionHistoryEntry[] }>

const API_BASE = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:8000/api`

async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text()
  if (!text) return `API error: ${res.status}`
  try {
    const body = JSON.parse(text)
    const detail = body?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((e: any) => {
          const loc = Array.isArray(e?.loc)
            ? e.loc.filter((p: unknown) => p !== 'body' && p !== 'query' && p !== 'path').join('.')
            : 'value'
          return `${loc}: ${e?.msg ?? 'Invalid value'}`
        })
        .join('; ')
    }
  } catch {
    // not JSON — fall through to raw text
  }
  return text
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res))
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export function fetchAccounts(userId?: number): Promise<Account[]> {
  const params = userId ? `?user_id=${userId}` : ''
  return request<Account[]>(`/accounts${params}`)
}

export function createAccount(data: AccountCreate): Promise<Account> {
  return request<Account>("/accounts", { method: 'POST', body: JSON.stringify(data) })
}

export function updateAccount(id: number, data: AccountUpdate): Promise<Account> {
  return request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteAccount(id: number): Promise<void> {
  return request<void>(`/accounts/${id}`, { method: 'DELETE' })
}

export function fetchCategories(): Promise<Category[]> {
  return request<Category[]>("/categories")
}

export function createCategory(data: CategoryCreate): Promise<Category> {
  return request<Category>("/categories", { method: 'POST', body: JSON.stringify(data) })
}

export function updateCategory(id: number, data: CategoryUpdate): Promise<Category> {
  return request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteCategory(id: number): Promise<void> {
  return request<void>(`/categories/${id}`, { method: 'DELETE' })
}

export function fetchTransactions(userId?: number): Promise<Transaction[]> {
  const params = userId ? `?user_id=${userId}` : ''
  return request<Transaction[]>(`/transactions${params}`)
}

export function searchTransactions(req: TransactionSearchRequest): Promise<TransactionSearchResponse> {
  return request<TransactionSearchResponse>('/transactions/search', { method: 'POST', body: JSON.stringify(req) })
}

export type PayeeSuggestion = Schemas['PayeeSuggestionOut']

export function fetchPayeeSuggestions(q: string, excludeId?: number | null, limit = 8): Promise<PayeeSuggestion[]> {
  const params = new URLSearchParams({ q, limit: String(limit) })
  if (excludeId != null) params.set('exclude_id', String(excludeId))
  return request<PayeeSuggestion[]>(`/transactions/payee-suggestions?${params}`)
}

export function fetchTransaction(id: number, userId?: number | null): Promise<Transaction> {
  const params = userId ? `?user_id=${userId}` : ''
  return request<Transaction>(`/transactions/${id}${params}`)
}

export function createTransaction(data: TransactionCreate, actorUserId?: number | null): Promise<Transaction> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<Transaction>(`/transactions${params}`, { method: 'POST', body: JSON.stringify(data) })
}

export function updateTransaction(id: number, data: TransactionUpdate, actorUserId?: number | null): Promise<Transaction> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<Transaction>(`/transactions/${id}${params}`, { method: 'PUT', body: JSON.stringify(data) })
}

export type TransactionRawFields = Pick<Transaction,
  'raw_source' | 'raw_label' | 'raw_counterparty' | 'raw_transaction_code' |
  'raw_merchant_category_code' | 'raw_merchant_location' | 'raw_initiated_date' | 'raw_booking_date'>

/** Admin mode only: rewrites the "As reported by the bank" fields. A key left
 * out is untouched, null (or a blank string) clears it. */
export function updateTransactionRawFields(id: number, data: TransactionRawFields, actorUserId?: number | null): Promise<Transaction> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<Transaction>(`/transactions/${id}/raw${params}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteTransaction(id: number, actorUserId?: number | null): Promise<void> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<void>(`/transactions/${id}${params}`, { method: 'DELETE' })
}

export function bulkUpdateTransactions(
  ids: number[],
  data: BulkTransactionUpdate,
  actorUserId?: number | null,
): Promise<BulkUpdateTransactionsResponse> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<BulkUpdateTransactionsResponse>(`/transactions/bulk-update${params}`, {
    method: 'PUT',
    body: JSON.stringify({ transaction_ids: ids, update: data }),
  })
}

/** Bulk-edit every transaction a search filter matches, across all pages,
 * rather than a list of ids. expectedCount is the total the user was shown:
 * the server answers 409 if the filter now matches a different number. */
export function bulkUpdateTransactionsByFilter(
  filter: TransactionSearchRequest,
  expectedCount: number,
  data: BulkTransactionUpdate,
  actorUserId?: number | null,
): Promise<BulkUpdateTransactionsResponse> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<BulkUpdateTransactionsResponse>(`/transactions/bulk-update${params}`, {
    method: 'PUT',
    body: JSON.stringify({ filter, expected_count: expectedCount, update: data }),
  })
}

export type BulkDeleteTransactionsResponse = Schemas['BulkDeleteTransactionsResponse']

export function bulkDeleteTransactions(
  ids: number[],
  actorUserId?: number | null,
): Promise<BulkDeleteTransactionsResponse> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<BulkDeleteTransactionsResponse>(`/transactions/bulk-delete${params}`, {
    method: 'DELETE',
    body: JSON.stringify({ transaction_ids: ids }),
  })
}

/** Admin mode: bulk-delete every transaction a search filter matches, across
 * all pages. Same 409 contract as bulkUpdateTransactionsByFilter. */
export function bulkDeleteTransactionsByFilter(
  filter: TransactionSearchRequest,
  expectedCount: number,
  actorUserId?: number | null,
): Promise<BulkDeleteTransactionsResponse> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<BulkDeleteTransactionsResponse>(`/transactions/bulk-delete${params}`, {
    method: 'DELETE',
    body: JSON.stringify({ filter, expected_count: expectedCount }),
  })
}

export function fetchTransactionHistory(transactionId: number): Promise<TransactionHistoryEntry[]> {
  return request<TransactionHistoryEntry[]>(`/transactions/${transactionId}/history`)
}

export function fetchHistory(params: {
  beforeId?: number | null
  limit?: number
  action?: string
  source?: string
}): Promise<HistoryPage> {
  const qs = new URLSearchParams()
  if (params.beforeId) qs.set('before_id', String(params.beforeId))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.action) qs.set('action', params.action)
  if (params.source) qs.set('source', params.source)
  const query = qs.toString()
  return request<HistoryPage>(`/history${query ? `?${query}` : ''}`)
}

export function historyGroupRef(entry: HistoryGroupRef): HistoryGroupRef {
  const { first_id, last_id, action, source, changed_by_user_id, batch_id } = entry
  return { first_id, last_id, action, source, changed_by_user_id, batch_id }
}

export function fetchHistoryRows(group: HistoryGroupRef, offset = 0, limit = 50): Promise<HistoryRows> {
  const qs = new URLSearchParams({
    first_id: String(group.first_id),
    last_id: String(group.last_id),
    action: group.action,
    offset: String(offset),
    limit: String(limit),
  })
  if (group.source !== null) qs.set('source', group.source)
  if (group.changed_by_user_id !== null) qs.set('changed_by_user_id', String(group.changed_by_user_id))
  if (group.batch_id !== null) qs.set('batch_id', group.batch_id)
  return request<HistoryRows>(`/history/rows?${qs}`)
}

export function divideTransaction(
  id: number,
  data: TransactionDivideRequest,
  actorUserId?: number | null,
): Promise<TransactionDivideResponse> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<TransactionDivideResponse>(`/transactions/${id}/divide${params}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function fetchDivideSiblings(transactionId: number): Promise<Transaction[]> {
  return request<Transaction[]>(`/transactions/${transactionId}/divide-siblings`)
}

// ── Linked transactions ─────────────────────────────────────────────
// A group of transactions that belong together (a transfer's two sides, an
// expense and its refunds), shown with their net. Linking rows of which one
// is already linked adds the others to its group.

export type TransactionLinkTotal = Schemas['TransactionLinkTotal']

export type TransactionLink = Schemas['TransactionLinkOut']

export function createTransactionLink(
  transactionIds: number[],
  name: string | null,
  actorUserId?: number | null,
): Promise<TransactionLink> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<TransactionLink>(`/transaction-links${params}`, {
    method: 'POST',
    body: JSON.stringify({ transaction_ids: transactionIds, name }),
  })
}

export function fetchTransactionLink(id: number): Promise<TransactionLink> {
  return request<TransactionLink>(`/transaction-links/${id}`)
}

export function renameTransactionLink(id: number, name: string | null): Promise<TransactionLink> {
  return request<TransactionLink>(`/transaction-links/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
}

// The group as it is afterwards, or null when it was left with fewer than two
// and dissolved.
export function unlinkTransactions(
  id: number,
  transactionIds: number[],
  actorUserId?: number | null,
): Promise<TransactionLink | null> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<TransactionLink | null>(`/transaction-links/${id}/unlink${params}`, {
    method: 'POST',
    body: JSON.stringify({ transaction_ids: transactionIds }),
  })
}

export function deleteTransactionLink(id: number, actorUserId?: number | null): Promise<void> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<void>(`/transaction-links/${id}${params}`, { method: 'DELETE' })
}

export function fetchUsers(): Promise<User[]> {
  return request<User[]>("/users")
}

export function createUser(data: UserCreate): Promise<User> {
  return request<User>("/users", { method: 'POST', body: JSON.stringify(data) })
}

export function updateUser(id: number, data: UserUpdate): Promise<User> {
  return request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteUser(id: number): Promise<void> {
  return request<void>(`/users/${id}`, { method: 'DELETE' })
}

export function fetchDashboard(userId?: number): Promise<DashboardData> {
  const params = userId ? `?user_id=${userId}` : ''
  return request<DashboardData>(`/dashboard${params}`)
}

export interface FetchChartsOptions {
  currency?: string
  startMonth?: string
  endMonth?: string
  parentCategoryId?: number
}

export function fetchCharts(userId: number, opts: FetchChartsOptions = {}): Promise<ChartsData> {
  const params = new URLSearchParams({ user_id: String(userId) })
  if (opts.currency) params.set('currency', opts.currency)
  if (opts.startMonth) params.set('start_month', opts.startMonth)
  if (opts.endMonth) params.set('end_month', opts.endMonth)
  if (opts.parentCategoryId != null) params.set('parent_category_id', String(opts.parentCategoryId))
  return request<ChartsData>(`/charts?${params.toString()}`)
}

export function fetchSplitWeights(): Promise<GlobalSplitWeight[]> {
  return request<GlobalSplitWeight[]>("/split-weights")
}

export function updateSplitWeights(weights: { user_id: number; weight: number }[]): Promise<GlobalSplitWeight[]> {
  return request<GlobalSplitWeight[]>("/split-weights", { method: 'PUT', body: JSON.stringify(weights) })
}

export function fetchAccountSplitWeights(accountId: number): Promise<AccountSplitWeight[]> {
  return request<AccountSplitWeight[]>(`/accounts/${accountId}/split-weights`)
}

export function updateAccountSplitWeights(accountId: number, weights: AccountSplitWeightCreate[]): Promise<AccountSplitWeight[]> {
  return request<AccountSplitWeight[]>(`/accounts/${accountId}/split-weights`, { method: 'PUT', body: JSON.stringify(weights) })
}

export function fetchBalances(): Promise<UserBalance[]> {
  return request<UserBalance[]>("/balances")
}

export async function detectImport(file: File): Promise<ImportDetectResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/import/detect`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function previewImport(file: File, data: ImportPreviewRequest): Promise<ImportPreviewRow[]> {
  const formData = new FormData()
  formData.append('file', file)
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) formData.append(key, String(value))
  }
  const res = await fetch(`${API_BASE}/import/preview`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export function commitImport(rows: ImportCommitRow[], actorUserId?: number | null): Promise<ImportCommitResponse> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<ImportCommitResponse>(`/import/commit${params}`, { method: 'POST', body: JSON.stringify({ rows }) })
}

export async function exportDatabase(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/backup/export`)
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.blob()
}

export async function importDatabase(file: File, mode: BackupImportMode): Promise<ImportSummary> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/backup/import?mode=${mode}`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export type OneDriveSettings = Schemas['OneDriveSettingsOut']

export type OneDriveSettingsUpdate = Schemas['OneDriveSettingsUpdate']

export type OneDriveBackupRunResult = Schemas['OneDriveBackupRunResult']

export function fetchOneDriveSettings(): Promise<OneDriveSettings> {
  return request<OneDriveSettings>('/onedrive/settings')
}

export function updateOneDriveSettings(data: OneDriveSettingsUpdate): Promise<OneDriveSettings> {
  return request<OneDriveSettings>('/onedrive/settings', { method: 'PUT', body: JSON.stringify(data) })
}

export function disconnectOneDrive(): Promise<OneDriveSettings> {
  return request<OneDriveSettings>('/onedrive/disconnect', { method: 'POST' })
}

export function runOneDriveBackupNow(): Promise<OneDriveBackupRunResult> {
  return request<OneDriveBackupRunResult>('/onedrive/backup/run-now', { method: 'POST' })
}

export function getOneDriveConnectUrl(): string {
  return `${API_BASE}/onedrive/auth/start`
}

// ── Bank sync (Enable Banking) ────────────────────────────────────────

export type BankInstitution = Schemas['BankInstitutionOut']

export type BankAccountLink = Schemas['BankAccountLinkOut']

export type BankConnection = Schemas['BankConnectionOut']

export type BankAccountLinkUpdate = Schemas['BankAccountLinkUpdate']

export type BankSyncRunResult = Schemas['BankSyncRunResult']

export function fetchBankInstitutions(country = 'FR'): Promise<BankInstitution[]> {
  return request<BankInstitution[]>(`/bank-sync/institutions?country=${country}`)
}

export function fetchBankConnections(): Promise<BankConnection[]> {
  return request<BankConnection[]>('/bank-sync/connections')
}

export function createBankConnection(aspspName: string, country = 'FR'): Promise<{ connection_id: number; authorization_url: string }> {
  return request<{ connection_id: number; authorization_url: string }>('/bank-sync/connections', {
    method: 'POST',
    body: JSON.stringify({ aspsp_name: aspspName, aspsp_country: country, language: 'fr' }),
  })
}

export function refreshBankConnection(id: number): Promise<BankConnection> {
  return request<BankConnection>(`/bank-sync/connections/${id}/refresh`, { method: 'POST' })
}

export function deleteBankConnection(id: number): Promise<void> {
  return request<void>(`/bank-sync/connections/${id}`, { method: 'DELETE' })
}

export function updateBankAccountLink(id: number, data: BankAccountLinkUpdate): Promise<BankAccountLink> {
  return request<BankAccountLink>(`/bank-sync/links/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function syncBankAccountLink(id: number): Promise<BankSyncRunResult> {
  return request<BankSyncRunResult>(`/bank-sync/links/${id}/sync`, { method: 'POST' })
}

/** Admin mode: fetch one explicit period from the bank again. Leaves the
 * link's last sync date and status untouched. Dates are YYYY-MM-DD. */
export function resyncBankAccountLink(id: number, dateFrom: string, dateTo: string): Promise<BankSyncRunResult> {
  return request<BankSyncRunResult>(`/bank-sync/links/${id}/resync`, {
    method: 'POST',
    body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
  })
}

// ── Automatic categorization ────────────────────────────────────
// `metrics` and `params` are typed loosely on purpose: the backend writes
// whatever `categorizer.evaluate()` produced at the time a model was fitted,
// and an old model keeps the shape it was stored with. The screen reads them
// defensively rather than assuming every key is there.

export interface CategorizerThresholdRow {
  threshold: number
  coverage: number
  accuracy: number
  parent_accuracy: number
}

export interface CategorizerBaseline {
  coverage?: number
  accuracy_on_covered?: number
  accuracy?: number
}

export interface CategorizerMetrics {
  tested_rows?: number
  accuracy?: number
  parent_accuracy?: number
  top3_accuracy?: number
  thresholds?: CategorizerThresholdRow[]
  baseline?: CategorizerBaseline
}

export type CategorizerModel = With<Schemas['CategorizerModelOut'], {
  params: Record<string, unknown> | null
  metrics: CategorizerMetrics | null
}>

export type CategorizerTrainRequest = Schemas['CategorizerTrainRequest']

export function fetchCategorizerModels(): Promise<CategorizerModel[]> {
  return request<CategorizerModel[]>('/categorizer/models')
}

export function trainCategorizerModel(req: CategorizerTrainRequest): Promise<CategorizerModel> {
  return request<CategorizerModel>('/categorizer/train', { method: 'POST', body: JSON.stringify(req) })
}

export function activateCategorizerModel(id: number): Promise<CategorizerModel> {
  return request<CategorizerModel>(`/categorizer/models/${id}/activate`, { method: 'POST' })
}

export function deleteCategorizerModel(id: number): Promise<void> {
  return request<void>(`/categorizer/models/${id}`, { method: 'DELETE' })
}

export type CategorizerSuggestion = Schemas['CategorizerSuggestion']

export type CategorizerSuggestResponse = Schemas['CategorizerSuggestResponse']

export type CategorizerApplyItem = Schemas['CategorizerApplyItem']

export type CategorizerApplyResponse = Schemas['CategorizerApplyResponse']

export function suggestCategories(transactionIds: number[]): Promise<CategorizerSuggestResponse> {
  return request<CategorizerSuggestResponse>('/categorizer/suggest', {
    method: 'POST',
    body: JSON.stringify({ transaction_ids: transactionIds }),
  })
}

export function applyCategorizerSuggestions(
  items: CategorizerApplyItem[],
  overwriteCategory: boolean,
  actorUserId: number | null,
): Promise<CategorizerApplyResponse> {
  const query = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<CategorizerApplyResponse>(`/categorizer/apply${query}`, {
    method: 'POST',
    body: JSON.stringify({ items, overwrite_category: overwriteCategory }),
  })
}

// ── Automatic rules ─────────────────────────────────────────────
// A rule is the advanced filter's conditions plus a bulk edit's actions (and a
// payee rename). Never a move to another account or a delete.

export type RuleActions = Schemas['RuleActions-Input']

export type SplitTier = 'global' | 'account' | 'category' | 'default'

export type RuleInput = Schemas['RuleCreate']

export type Rule = Schemas['RuleOut']

/** What the rules change on one transaction: only the fields a rule changed
 *  are set; `split_weights` set means a rule set the split. */
export type RuleOutcome = With<Schemas['RuleOutcomeOut'], { split_source: SplitSource | null }>

export type RulePreviewItem = With<Schemas['RulePreviewItem'], { outcome: RuleOutcome | null }>

export type RulePreviewResponse = With<Schemas['RulePreviewResponse'], { items: RulePreviewItem[] }>

export function fetchRules(): Promise<Rule[]> {
  return request<Rule[]>('/rules')
}

export function createRule(data: RuleInput): Promise<Rule> {
  return request<Rule>('/rules', { method: 'POST', body: JSON.stringify(data) })
}

export function updateRule(id: number, data: RuleInput): Promise<Rule> {
  return request<Rule>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteRule(id: number): Promise<void> {
  return request<void>(`/rules/${id}`, { method: 'DELETE' })
}

export function reorderRules(ruleIds: number[]): Promise<Rule[]> {
  return request<Rule[]>('/rules/order', { method: 'PUT', body: JSON.stringify({ rule_ids: ruleIds }) })
}

export function previewRules(transactionIds: number[], ruleIds: number[]): Promise<RulePreviewResponse> {
  return request<RulePreviewResponse>('/rules/preview', {
    method: 'POST',
    body: JSON.stringify({ transaction_ids: transactionIds, rule_ids: ruleIds }),
  })
}

export function applyRules(
  transactionIds: number[], ruleIds: number[], actorUserId: number | null,
): Promise<{ updated_count: number; transaction_ids: number[] }> {
  const query = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<{ updated_count: number; transaction_ids: number[] }>(`/rules/apply${query}`, {
    method: 'POST',
    body: JSON.stringify({ transaction_ids: transactionIds, rule_ids: ruleIds }),
  })
}

// ── Saved filters (Transactions screen) ─────────────────────────
// The screen's own filter state saved under a name and shown as a button next
// to Simple/Advanced. Stored server-side so every device sees the same list.

export interface SimpleFilterState {
  search: string
  date_from: string
  date_to: string
  /** One id (0 for any, UNCATEGORIZED_ID for no category), or several ids
   *  once more than one is ticked: a filter saved with one id keeps its shape. */
  account_id: number | number[]
  category_id: number | number[]
  amount_min: string
  amount_max: string
  reconciled: string
  /** A tag id, UNTAGGED_ID for "no tag", 0 for any (absent in older saved filters). */
  tag_id?: number
  /** The date order (Newest/Oldest first) saved with the filter. */
  sort_dir?: 'asc' | 'desc'
}

export interface AdvancedFilterState {
  match_mode: 'all' | 'any'
  conditions: { field: string; operator: string; value: string; value2: string }[]
  sort_dir?: 'asc' | 'desc'
}

export type SavedFilterInput =
  | { name: string; mode: 'simple'; filters: SimpleFilterState }
  | { name: string; mode: 'advanced'; filters: AdvancedFilterState }

export type SavedFilter = SavedFilterInput & {
  id: number
  position: number
  created_at: string
  updated_at: string
}

export function fetchSavedFilters(): Promise<SavedFilter[]> {
  return request<SavedFilter[]>('/saved-filters')
}

export function createSavedFilter(data: SavedFilterInput): Promise<SavedFilter> {
  return request<SavedFilter>('/saved-filters', { method: 'POST', body: JSON.stringify(data) })
}

/** Rename (`name`), or replace what it holds (`mode` and `filters` together). */
export function updateSavedFilter(id: number, data: Partial<SavedFilterInput>): Promise<SavedFilter> {
  return request<SavedFilter>(`/saved-filters/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteSavedFilter(id: number): Promise<void> {
  return request<void>(`/saved-filters/${id}`, { method: 'DELETE' })
}

export function reorderSavedFilters(filterIds: number[]): Promise<SavedFilter[]> {
  return request<SavedFilter[]>('/saved-filters/order', { method: 'PUT', body: JSON.stringify({ filter_ids: filterIds }) })
}

export type AlertFrequency = 'daily' | 'weekly' | 'monthly'

export type EmailAlert = Schemas['EmailAlertOut']

export type EmailAlertUpdate = Schemas['EmailAlertUpdate']

export type EmailAlertTestResult = Schemas['EmailAlertTestResult']

export function fetchEmailAlert(userId: number): Promise<EmailAlert> {
  return request<EmailAlert>(`/alerts/users/${userId}`)
}

export function updateEmailAlert(userId: number, data: EmailAlertUpdate): Promise<EmailAlert> {
  return request<EmailAlert>(`/alerts/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function sendTestEmailAlert(userId: number): Promise<EmailAlertTestResult> {
  return request<EmailAlertTestResult>(`/alerts/users/${userId}/test`, { method: 'POST' })
}

// ── Tags ────────────────────────────────────────────────────────

export function fetchTags(): Promise<Tag[]> {
  return request<Tag[]>('/tags')
}

export function createTag(data: { name: string; color?: string | null }): Promise<Tag> {
  return request<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) })
}

export function updateTag(id: number, data: { name?: string; color?: string | null }): Promise<Tag> {
  return request<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteTag(id: number, actorUserId?: number | null): Promise<void> {
  const query = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<void>(`/tags/${id}${query}`, { method: 'DELETE' })
}
