export interface AccountUser {
  user_id: number
  user_name: string
  ownership_percentage: number
}

export interface Account {
  id: number
  name: string
  type: string
  balance: number
  currency: string
  created_at: string
  users: AccountUser[]
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
  users?: AccountUserCreate[]
}

export interface CategorySplit {
  user_id: number
  user_name: string
  split_percentage: number
}

export interface CategorySplitCreate {
  user_id: number
  split_percentage: number
}

export interface Category {
  id: number
  name: string
  type: string
  splits: CategorySplit[]
}

export interface CategoryCreate {
  name: string
  type: string
  splits?: CategorySplitCreate[]
}

export interface CategoryUpdate {
  name?: string
  type?: string
  splits?: CategorySplitCreate[]
}

export interface GlobalSplitWeight {
  user_id: number
  user_name: string
  weight: number
}

export interface SplitShareCreate {
  user_id: number
  share_amount: number
}

export interface TransactionSplit {
  user_id: number
  user_name: string
  share_amount: number
  source: 'manual' | 'category_default' | 'global_default'
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
  category_id: number
  category_name: string
  splits: TransactionSplit[]
}

export interface TransactionCreate {
  date: string
  payee: string
  memo?: string | null
  amount: number
  account_id: number
  category_id: number
  split_overrides?: SplitShareCreate[] | null
}

export interface TransactionUpdate {
  date?: string
  payee?: string
  memo?: string | null
  amount?: number
  account_id?: number
  category_id?: number
  split_overrides?: SplitShareCreate[] | null
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
  conditions?: FilterCondition[]
  match_mode?: 'all' | 'any'
  page?: number
  page_size?: number
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

export interface ImportPreviewRequest {
  csv_text: string
  account_id: number
  date_col: string
  payee_col: string
  amount_col: string
  memo_col?: string | null
  category_col?: string | null
  has_header?: boolean
  date_format?: string | null
}

export interface ImportPreviewRow {
  row_number: number
  transaction_date: string | null
  payee: string | null
  memo: string | null
  amount: number | null
  account_id: number
  category_id: number | null
  category_name: string | null
  status: 'ok' | 'needs_category' | 'possible_duplicate' | 'error'
  error_message: string | null
  preview_split: { user_id: number; share_amount: number; source: string }[]
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
  transactions: number
  transaction_splits: number
  transaction_history: number
}

export interface TransactionHistoryEntry {
  id: number
  transaction_id: number
  action: 'created' | 'updated' | 'deleted'
  source: 'manual' | 'csv_import' | null
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || `API error: ${res.status}`)
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

export function fetchTransactionHistory(transactionId: number): Promise<TransactionHistoryEntry[]> {
  return request<TransactionHistoryEntry[]>(`/transactions/${transactionId}/history`)
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

export function fetchSplitWeights(): Promise<GlobalSplitWeight[]> {
  return request<GlobalSplitWeight[]>("/split-weights")
}

export function updateSplitWeights(weights: { user_id: number; weight: number }[]): Promise<GlobalSplitWeight[]> {
  return request<GlobalSplitWeight[]>("/split-weights", { method: 'PUT', body: JSON.stringify(weights) })
}

export function fetchSplitPreview(amount: number, categoryId: number | null, accountId: number | null = null): Promise<TransactionSplit[]> {
  return request<TransactionSplit[]>("/split-preview", {
    method: 'POST',
    body: JSON.stringify({ amount, category_id: categoryId, account_id: accountId }),
  })
}

export function fetchBalances(): Promise<UserBalance[]> {
  return request<UserBalance[]>("/balances")
}

export function previewImport(data: ImportPreviewRequest): Promise<ImportPreviewRow[]> {
  return request<ImportPreviewRow[]>("/import/preview", { method: 'POST', body: JSON.stringify(data) })
}

export function commitImport(rows: TransactionCreate[], actorUserId?: number | null): Promise<ImportCommitResponse> {
  const params = actorUserId ? `?actor_user_id=${actorUserId}` : ''
  return request<ImportCommitResponse>(`/import/commit${params}`, { method: 'POST', body: JSON.stringify({ rows }) })
}

export async function exportDatabase(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/backup/export`)
  if (!res.ok) throw new Error(await res.text() || `API error: ${res.status}`)
  return res.blob()
}

export async function importDatabase(file: File, mode: BackupImportMode): Promise<ImportSummary> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/backup/import?mode=${mode}`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await res.text() || `API error: ${res.status}`)
  return res.json()
}
