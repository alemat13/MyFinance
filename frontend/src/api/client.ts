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
  users?: AccountUserCreate[]
}

export interface AccountUpdate {
  name?: string
  type?: string
  balance?: number
  users?: AccountUserCreate[]
}

export interface Category {
  id: number
  name: string
  type: string
}

export interface CategoryCreate {
  name: string
  type: string
}

export interface CategoryUpdate {
  name?: string
  type?: string
}

export interface Transaction {
  id: number
  date: string
  payee: string
  memo: string | null
  amount: number
  account_id: number
  account_name: string
  category_id: number
  category_name: string
}

export interface TransactionCreate {
  date: string
  payee: string
  memo?: string | null
  amount: number
  account_id: number
  category_id: number
}

export interface TransactionUpdate {
  date?: string
  payee?: string
  memo?: string | null
  amount?: number
  account_id?: number
  category_id?: number
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
}

const API_BASE = "http://localhost:8000/api"

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

export function createTransaction(data: TransactionCreate): Promise<Transaction> {
  return request<Transaction>("/transactions", { method: 'POST', body: JSON.stringify(data) })
}

export function updateTransaction(id: number, data: TransactionUpdate): Promise<Transaction> {
  return request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteTransaction(id: number): Promise<void> {
  return request<void>(`/transactions/${id}`, { method: 'DELETE' })
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
