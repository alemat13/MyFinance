import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Wallet, Tags, ArrowLeftRight, Users as UsersIcon,
  Scale, Upload, Settings, Sun, Moon,
} from 'lucide-react'
import { fetchUsers, User } from './api/client'
import { useTheme } from './context/ThemeContext'
import { IconButton, Select } from './components/ui'
import Dashboard from './components/Dashboard'
import AccountsList from './components/AccountsList'
import CategoriesList from './components/CategoriesList'
import TransactionsPage from './components/TransactionsPage'
import UsersList from './components/UsersList'
import SplitWeightsSettings from './components/SplitWeightsSettings'
import CsvImportPage from './components/CsvImportPage'

type View = 'dashboard' | 'accounts' | 'categories' | 'transactions' | 'users' | 'split-settings' | 'import'

const viewLabels: Record<View, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  categories: 'Categories',
  transactions: 'Transactions',
  users: 'Users',
  'split-settings': 'Split Weights',
  import: 'Import CSV',
}

const viewIcons: Record<View, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  accounts: Wallet,
  categories: Tags,
  transactions: ArrowLeftRight,
  users: UsersIcon,
  'split-settings': Scale,
  import: Upload,
}

function loadSelectedUserId(): number | null {
  try {
    const val = localStorage.getItem('selectedUserId')
    return val ? parseInt(val, 10) || null : null
  } catch {
    return null
  }
}

function saveSelectedUserId(id: number | null) {
  try {
    if (id) localStorage.setItem('selectedUserId', String(id))
    else localStorage.removeItem('selectedUserId')
  } catch { /* ignore */ }
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => loadSelectedUserId())
  const [users, setUsers] = useState<User[]>([])
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    fetchUsers().then(setUsers).catch(() => {})
  }, [])

  const handleSelectUser = (userId: number | null) => {
    setSelectedUserId(userId)
    saveSelectedUserId(userId)
  }

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div className="min-h-screen p-5 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">MyFinance</h1>
        <div className="flex items-center gap-2">
          <Select
            value={selectedUserId ?? ''}
            onChange={e => handleSelectUser(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="min-w-[120px]"
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <IconButton aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
          <div className="relative z-[1001]">
            <IconButton aria-label="Settings" onClick={() => setMenuOpen(o => !o)}>
              <Settings size={18} />
            </IconButton>
            {menuOpen && (
              <div className="absolute top-full right-0 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                {(Object.keys(viewLabels) as View[]).map(v => {
                  const Icon = viewIcons[v]
                  return (
                    <button
                      key={v}
                      onClick={() => { setView(v); setMenuOpen(false) }}
                      className={`flex items-center gap-2 w-full px-4 py-2.5 text-left text-sm cursor-pointer ${
                        view === v
                          ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                      }`}
                    >
                      <Icon size={16} />
                      {viewLabels[v]}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedUserId && selectedUser && (
        <div className="mb-3 text-[13px] text-slate-500 dark:text-slate-400">
          Filtering by: <strong className="text-slate-700 dark:text-slate-200">{selectedUser.name}</strong>{' '}
          <button
            onClick={() => handleSelectUser(null)}
            className="text-accent hover:underline cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {view === 'dashboard' && <Dashboard selectedUserId={selectedUserId} />}
      {view === 'accounts' && <AccountsList onBack={() => setView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'categories' && <CategoriesList onBack={() => setView('dashboard')} />}
      {view === 'transactions' && <TransactionsPage onBack={() => setView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'users' && <UsersList onBack={() => setView('dashboard')} onSelectUser={handleSelectUser} />}
      {view === 'split-settings' && <SplitWeightsSettings onBack={() => setView('dashboard')} />}
      {view === 'import' && <CsvImportPage onBack={() => setView('dashboard')} />}

      {menuOpen && (
        <div className="fixed inset-0 z-[1000]" onClick={() => setMenuOpen(false)} />
      )}
    </div>
  )
}
