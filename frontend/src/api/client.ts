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
  // What the source reported before any renaming. Read-only everywhere:
  // there is no matching field on TransactionCreate/TransactionUpdate.
  // Optional like category_color/icon above — the API always sends them, but
  // declaring them required would force every fixture and every hand-built
  // Transaction to spell out seven nulls it does not care about.
  raw_source?: 'enable_banking' | 'linxo_export' | null
  raw_label?: string | null
  raw_counterparty?: string | null
  raw_transaction_code?: string | null
  raw_merchant_category_code?: string | null
  raw_merchant_location?: string | null
  raw_initiated_date?: string | null
  splits: TransactionSplit[]
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
}

// Only include a key here when its section is meant to be applied to every
// selected transaction — an omitted key leaves that field untouched on all
// of them, mirroring the backend's exclude_unset contract.
export interface BulkTransactionUpdate {
  category_id?: number | null
  accounting_month_offset?: number
  reconciled?: boolean
  split_weights?: SplitWeightCreate[] | null
  split_source?: SplitSource | null
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

export type FilterField = 'payee' | 'memo' | 'amount' | 'date' | 'account_id' | 'category_id'

export interface FilterCondition {
  field: FilterField
  operator: string
  value?: string | number | null
  value2?: string | number | null
}

export interface TransactionSearchRequest {
  user_id?: number
  search?: string
  date_from?: string
  date_to?: string
  account_id?: number
  category_id?: number
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
}

export interface ImportCommitResponse {
  created_count: number
  transaction_ids: number[]
}

export type BackupImportMode = 'overwrite' | 'append'

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

export function commitImport(rows: TransactionCreate[], actorUserId?: number | null): Promise<ImportCommitResponse> {
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

export type OneDriveFrequency = 'daily' | 'weekly' | 'monthly'

export interface OneDriveSettings {
  connected: boolean
  account_email: string | null
  folder_path: string | null
  frequency: OneDriveFrequency
  retention_count: number
  last_backup_at: string | null
  last_backup_status: 'success' | 'failed' | null
  last_backup_error: string | null
}

export interface OneDriveSettingsUpdate {
  folder_path: string
  frequency: OneDriveFrequency
  retention_count: number
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
