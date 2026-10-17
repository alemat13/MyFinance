export interface AccountUser {
  user_id: number
  user_name: string
  ownership_percentage: number
}

export interface AccountSplitWeight {
  user_id: number
  user_name: string
  weight: number
}

export interface AccountSplitWeightCreate {
  user_id: number
  weight: number
}

export interface Account {
  id: number
  name: string
  type: string
  balance: number
  currency: string
  created_at: string
  archived: boolean
  users: AccountUser[]
  split_weights: AccountSplitWeight[]
  // Only sent by GET /api/dashboard; null when the account has no transactions.
  last_transaction_date?: string | null
}

export interface AccountUserCreate {
  user_id: number
  ownership_percentage: number
}

export interface AccountCreate {
  name: string
  type: string
  balance?: number
  currency?: string
  users?: AccountUserCreate[]
}

export interface AccountUpdate {
  name?: string
  type?: string
  balance?: number
  currency?: string
  archived?: boolean
  users?: AccountUserCreate[]
}

export interface CategorySplit {
  user_id: number
  user_name: string
  weight: number
}

export interface CategorySplitCreate {
  user_id: number
  weight: number
}

export interface Category {
  id: number
  name: string
  type: string
  color?: string | null
  icon?: string | null
  parent_id?: number | null
  parent_name?: string | null
  splits: CategorySplit[]
}

export interface CategoryCreate {
  name: string
  type: string
  color?: string | null
  icon?: string | null
  parent_id?: number | null
  splits?: CategorySplitCreate[]
}

export interface CategoryUpdate {
  name?: string
  type?: string
  color?: string | null
  icon?: string | null
  parent_id?: number | null
  splits?: CategorySplitCreate[]
}

export interface GlobalSplitWeight {
  user_id: number
  user_name: string
  weight: number
}

export type SplitSource = 'global' | 'account' | 'category' | 'custom'

export interface SplitWeightCreate {
  user_id: number
  weight: number
}

export interface TransactionSplit {
  user_id: number
  user_name: string
  weight: number
  share_amount: number
  source: SplitSource
}

export interface UserBalance {
  user_id: number
  user_name: string
  currency: string
  net_position: number
}

/** A free label on transactions, many-to-many: a transaction carries any
 *  number of tags. Means nothing to balances, charts or splits. */
export interface TagRef {
  id: number
  name: string
  color?: string | null
}

export interface Tag extends TagRef {
  transaction_count: number
}

export interface Transaction {
  id: number
  date: string
  payee: string
  memo: string | null
  amount: number
  account_id: number
  account_name: string
  currency: string
  category_id: number | null
  category_name: string | null
  category_color?: string | null
  category_icon?: string | null
  accounting_month_offset: number
  accounting_month: string
  reconciled: boolean
  divide_group_id: number | null
  // What the source reported before any renaming. No matching field on
  // TransactionCreate/TransactionUpdate: only admin mode rewrites them, via
  // updateTransactionRawFields().
  // Optional like category_color/icon above — the API always sends them, but
  // declaring them required would force every fixture and every hand-built
  // Transaction to spell out seven nulls it does not care about.
  raw_source?: 'enable_banking' | 'csv_import' | 'linxo_export' | null
  raw_label?: string | null
  raw_counterparty?: string | null
  raw_transaction_code?: string | null
  raw_merchant_category_code?: string | null
  raw_merchant_location?: string | null
  raw_initiated_date?: string | null
  raw_booking_date?: string | null
  splits: TransactionSplit[]
  // Optional for the same reason as the raw fields: the API always sends it.
  tags?: TagRef[]
}

export interface TransactionCreate {
  date: string
  payee: string
  memo?: string | null
  amount: number
  account_id: number
  category_id?: number | null
  accounting_month_offset?: number
  split_weights?: SplitWeightCreate[] | null
  split_source?: SplitSource | null
  tag_ids?: number[]
}

export interface TransactionUpdate {
  date?: string
  payee?: string
  memo?: string | null
  amount?: number
  account_id?: number
  category_id?: number | null
  accounting_month_offset?: number
  reconciled?: boolean
  split_weights?: SplitWeightCreate[] | null
  split_source?: SplitSource | null
  // Replaces the whole set of tags; omitted leaves them alone.
  tag_ids?: number[]
}

// Only include a key here when its section is meant to be applied to every
// selected transaction — an omitted key leaves that field untouched on all
// of them, mirroring the backend's exclude_unset contract.
export type PayeeMode = 'replace' | 'prepend' | 'append'

export interface BulkTransactionUpdate {
  category_id?: number | null
  // Renames every selected transaction (payee only, never the memo).
  payee?: string
  // What to do with `payee`: set it (default), or add it before/after each
  // row's own payee, as typed (a separating space is part of the text).
  payee_mode?: PayeeMode
  // Admin mode only: moves the selection to this account, splits unchanged.
  account_id?: number
  accounting_month_offset?: number
  reconciled?: boolean
  split_weights?: SplitWeightCreate[] | null
  split_source?: SplitSource | null
  // Tags added to / removed from every selected row, which keeps its others.
  add_tag_ids?: number[]
  remove_tag_ids?: number[]
}

export interface BulkUpdateTransactionsResponse {
  updated_count: number
  transaction_ids: number[]
}

// A "Divide" splits one transaction's amount into several new transactions
// by category/date — unrelated to split_weights/SplitSource above, which
// divide a transaction's amount among users. No account_id: every part
// stays on the original transaction's account.
export interface TransactionDividePart {
  date: string
  payee: string
  memo?: string | null
  amount: number
  category_id?: number | null
  accounting_month_offset?: number
  split_weights?: SplitWeightCreate[] | null
  split_source?: SplitSource | null
}

export interface TransactionDivideRequest {
  parts: TransactionDividePart[]
}

export interface TransactionDivideResponse {
  transactions: Transaction[]
}

export type FilterField = 'payee' | 'memo' | 'raw_label' | 'amount' | 'date' | 'account_id' | 'category_id'
  | 'split_weight' | 'split_share' | 'split_balance' | 'tag_id'

export interface FilterCondition {
  field: FilterField
  operator: string
  value?: string | number | null
  value2?: string | number | null
  // The user a per-user field (split_weight/split_share/split_balance) reads.
  user_id?: number | null
}

export interface TransactionSearchRequest {
  user_id?: number
  search?: string
  date_from?: string
  date_to?: string
  account_id?: number
  category_id?: number
  // Only the transactions with no category.
  uncategorized?: boolean
  // Only the transactions carrying this tag, or (untagged) carrying none.
  tag_id?: number
  untagged?: boolean
  amount_min?: number
  amount_max?: number
  reconciled?: boolean
  conditions?: FilterCondition[]
  match_mode?: 'all' | 'any'
  page?: number
  page_size?: number
  unpaginated?: boolean
  sort_by?: 'date' | 'amount' | 'payee' | 'created_at'
  sort_dir?: 'asc' | 'desc'
}

export interface TransactionSearchResponse {
  items: Transaction[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface User {
  id: number
  name: string
  email: string | null
  created_at: string
}

export interface UserCreate {
  name: string
  email?: string | null
}

export interface UserUpdate {
  name?: string
  email?: string | null
}

export interface DashboardData {
  accounts: Account[]
  recent_transactions: Transaction[]
  balances: UserBalance[]
}

export interface ImportDetectResponse {
  headers: string[]
  encoding: string
  delimiter: string
  date_format: string | null
  decimal_separator: string
  column_mapping: Record<'date' | 'payee' | 'amount' | 'memo' | 'category' | 'account', string | null>
  sample_rows: Record<string, string>[]
  file_format?: 'csv' | 'qif'
}

export interface CategoryChartItem {
  category_id: number | null
  category_name: string
  category_type: 'Income' | 'Expense' | 'Uncategorized'
  color?: string | null
  amount: number
  currency: string
}

export interface MonthChartItem {
  month: string
  income: number
  expense: number
  uncategorized: number
  currency: string
}

export interface NetMonthChartItem {
  month: string
  net: number
  currency: string
}

export interface MonthCategoryChartItem {
  month: string
  category_id: number | null
  amount: number
  currency: string
}

export interface ChartCategoryOut {
  category_id: number | null
  name: string
  color?: string | null
  icon?: string | null
}

export interface ParentCategoryOut {
  id: number
  name: string
}

export interface ChartsData {
  currencies: string[]
  by_category: CategoryChartItem[]
  by_month: MonthChartItem[]
  net_by_month: NetMonthChartItem[]
  by_month_category: MonthCategoryChartItem[]
  chart_categories: ChartCategoryOut[]
  parent_category: ParentCategoryOut | null
}

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

export interface ImportPreviewRow {
  row_number: number
  transaction_date: string | null
  payee: string | null
  memo: string | null
  amount: number | null
  account_id: number
  account_name: string | null
  account_matched: boolean
  category_id: number | null
  category_name: string | null
  status: 'ok' | 'needs_category' | 'possible_duplicate' | 'error'
  error_message: string | null
  preview_split: { user_id: number; weight: number; share_amount: number; source: string }[]
  // What the active categorization model would file this row under, or null
  // throughout when no model is active. Advisory: the screen offers it next
  // to the file's own category and commits whichever one the user kept.
  suggested_category_id: number | null
  suggested_category_name: string | null
  suggested_confidence: number | null
  // What the enabled automatic rules would change on this row, or null when
  // no rule matches. The screen applies it unless the user switches rules off.
  rules: RuleOutcome | null
}

/** A row as the import commits it: `raw_label` is the file's own payee, sent
 *  separately because a rule may have renamed `payee` in the preview. */
export interface ImportCommitRow extends TransactionCreate {
  raw_label?: string | null
  reconciled?: boolean
}

export interface ImportCommitResponse {
  created_count: number
  transaction_ids: number[]
}

export type BackupImportMode = 'overwrite' | 'partial'

export interface ImportSummary {
  mode: BackupImportMode
  users: number
  accounts: number
  categories: number
  account_users: number
  category_splits: number
  global_split_weights: number
  account_split_weights: number
  transactions: number
  transaction_splits: number
  transaction_history: number
  bank_connections: number
  bank_account_links: number
}

export interface TransactionHistoryEntry {
  id: number
  transaction_id: number
  action: 'created' | 'updated' | 'deleted'
  source: 'manual' | 'csv_import' | 'divide' | null
  changed_at: string
  changed_by_user_id: number | null
  changed_by_user_name: string | null
  date: string | null
  payee: string | null
  memo: string | null
  amount: number | null
  account_id: number | null
  category_id: number | null
  changes: Record<string, { old: unknown; new: unknown }> | null
}

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

export interface PayeeSuggestion {
  payee: string
  category_id: number | null
  category_name: string | null
  date: string
  amount: number
  currency: string
}

export function fetchPayeeSuggestions(q: string, limit = 8): Promise<PayeeSuggestion[]> {
  const params = new URLSearchParams({ q, limit: String(limit) })
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

export interface BulkDeleteTransactionsResponse {
  deleted_count: number
  transaction_ids: number[]
}

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

export interface OneDriveSettings {
  connected: boolean
  account_email: string | null
  folder_path: string | null
  keep_daily: number
  keep_weekly: number
  keep_monthly: number
  keep_yearly: number
  last_backup_at: string | null
  last_backup_status: 'success' | 'failed' | null
  last_backup_error: string | null
}

export interface OneDriveSettingsUpdate {
  folder_path: string
  keep_daily: number
  keep_weekly: number
  keep_monthly: number
  keep_yearly: number
}

export interface OneDriveBackupRunResult {
  ran: boolean
  status: 'success' | 'failed' | null
  error: string | null
}

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

export interface BankInstitution {
  name: string
  country: string
  logo: string | null
}

export interface BankAccountLink {
  id: number
  connection_id: number
  iban: string | null
  remote_name: string | null
  currency: string | null
  account_id: number | null
  account_name: string | null
  sync_enabled: boolean
  sync_from_date: string | null
  last_synced_at: string | null
  last_sync_status: 'success' | 'failed' | null
  last_sync_error: string | null
  last_imported_count: number
}

export interface BankConnection {
  id: number
  aspsp_name: string
  aspsp_country: string
  status: 'pending' | 'linked' | 'expired' | 'error'
  access_valid_until: string | null
  created_at: string | null
  last_error: string | null
  accounts: BankAccountLink[]
}

export interface BankAccountLinkUpdate {
  account_id: number | null
  sync_enabled: boolean
  sync_from_date?: string | null
}

export interface BankSyncRunResult {
  ran: boolean
  synced_links: number
  created_count: number
  status: 'success' | 'failed' | null
  error: string | null
}

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

export interface CategorizerModel {
  id: number
  created_at: string
  status: string
  is_active: boolean
  trained_rows: number
  tested_rows: number
  note: string | null
  params: Record<string, unknown> | null
  metrics: CategorizerMetrics | null
  error: string | null
}

export interface CategorizerTrainRequest {
  train: TransactionSearchRequest
  test: TransactionSearchRequest
  note?: string
}

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

export interface CategorizerSuggestion {
  transaction_id: number
  date: string
  payee: string
  raw_label: string | null
  amount: number
  current_category_id: number | null
  current_category_name: string | null
  suggested_category_id: number | null
  suggested_category_name: string | null
  confidence: number | null
  high_confidence: boolean
  category_changed: boolean
}

export interface CategorizerSuggestResponse {
  model_id: number
  threshold: number
  items: CategorizerSuggestion[]
  category_changes: number
  high_confidence_changes: number
}

export interface CategorizerApplyItem {
  transaction_id: number
  category_id: number
}

export interface CategorizerApplyResponse {
  updated_count: number
  transaction_ids: number[]
  skipped_transaction_ids: number[]
}

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

export interface RuleActions {
  payee?: string | null
  category_id?: number | null
  accounting_month_offset?: number | null
  reconciled?: boolean | null
  split_weights?: { user_id: number; weight: number }[] | null
  split_source?: SplitSource | null
  /** A weight tier read when the rule runs (not copied into the rule), so a
   *  later change to that tier carries through. Exclusive with split_weights. */
  split_tier?: SplitTier | null
  /** Tags added to a matching transaction, which keeps the ones it has. */
  add_tag_ids?: number[] | null
}

export type SplitTier = 'global' | 'account' | 'category' | 'default'

export interface RuleInput {
  name: string
  enabled: boolean
  match_mode: 'all' | 'any'
  conditions: FilterCondition[]
  actions: RuleActions
}

export interface Rule extends RuleInput {
  id: number
  position: number
  created_at: string
  updated_at: string
}

/** What the rules change on one transaction: only the fields a rule changed
 *  are set; `split_weights` set means a rule set the split. */
export interface RuleOutcome {
  rule_ids: number[]
  rule_names: string[]
  payee: string | null
  category_id: number | null
  category_name: string | null
  accounting_month_offset: number | null
  reconciled: boolean | null
  split_weights: { user_id: number; weight: number }[] | null
  split_source: SplitSource | null
  /** Tags a rule adds that the row does not carry yet. */
  add_tag_ids?: number[] | null
  add_tag_names?: string[] | null
}

export interface RulePreviewItem {
  transaction_id: number
  date: string
  payee: string
  amount: number
  current_category_id: number | null
  current_category_name: string | null
  current_accounting_month_offset: number
  current_reconciled: boolean
  outcome: RuleOutcome | null
}

export interface RulePreviewResponse {
  items: RulePreviewItem[]
  changed_count: number
}

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
  account_id: number
  category_id: number
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

export interface EmailAlert {
  user_id: number
  email: string | null
  daily: boolean
  weekly: boolean
  monthly: boolean
  last_daily_sent_at: string | null
  last_weekly_sent_at: string | null
  last_monthly_sent_at: string | null
  last_status: 'success' | 'failed' | null
  last_error: string | null
  sending_configured: boolean
  from_address: string
}

export interface EmailAlertUpdate {
  email: string | null
  daily: boolean
  weekly: boolean
  monthly: boolean
}

export interface EmailAlertTestResult {
  sent_to: string
  transaction_count: number
}

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
