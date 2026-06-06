export interface Account {
  id: number
  name: string
  type: string
  balance: number
  created_at: string
}

export interface Category {
  id: number
  name: string
  type: string
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

export interface DashboardData {
  accounts: Account[]
  recent_transactions: Transaction[]
}

const API_BASE = "http://localhost:8000/api"

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export function fetchAccounts(): Promise<Account[]> {
  return request<Account[]>("/accounts")
}

export function fetchCategories(): Promise<Category[]> {
  return request<Category[]>("/categories")
}

export function fetchTransactions(): Promise<Transaction[]> {
  return request<Transaction[]>("/transactions")
}

export function fetchDashboard(): Promise<DashboardData> {
  return request<DashboardData>("/dashboard")
}
