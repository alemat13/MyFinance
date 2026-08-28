import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Wallet, Tags, ArrowLeftRight, Users as UsersIcon,
  Scale, Upload, Database, Settings, Sun, Moon, BarChart3,
} from 'lucide-react'
import { fetchUsers, User } from './api/client'
import { useTheme } from './context/ThemeContext'
import { getParam, patchQueryParams } from './utils/urlState'
import { IconButton, Select } from './components/ui'
import Dashboard from './components/Dashboard'
import FirstLaunchUserPrompt from './components/FirstLaunchUserPrompt'
import AccountsList from './components/AccountsList'
import CategoriesList from './components/CategoriesList'
import TransactionsPage from './components/TransactionsPage'
import UsersList from './components/UsersList'
import SplitWeightsSettings from './components/SplitWeightsSettings'
import CsvImportPage from './components/CsvImportPage'
import BackupPage from './components/BackupPage'
import ChartsPage from './components/ChartsPage'

type View = 'dashboard' | 'accounts' | 'categories' | 'transactions' | 'users' | 'split-settings' | 'import' | 'backup' | 'charts'

const viewLabels: Record<View, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  categories: 'Categories',
  transactions: 'Transactions',
  users: 'Users',
  'split-settings': 'Split Weights',
  import: 'Import CSV',
  backup: 'Backup & Restore',
  charts: 'Charts',
}

const viewIcons: Record<View, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  accounts: Wallet,
  categories: Tags,
  transactions: ArrowLeftRight,
  users: UsersIcon,
  'split-settings': Scale,
  import: Upload,
  backup: Database,
  charts: BarChart3,
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
    if (id) {
      localStorage.setItem('selectedUserId', String(id))
      localStorage.setItem('userChoiceMade', '1')
    } else {
      localStorage.removeItem('selectedUserId')
    }
  } catch { /* ignore */ }
}

function hasMadeUserChoice(): boolean {
  try {
    return localStorage.getItem('userChoiceMade') === '1'
  } catch {
    return false
  }
}

function loadInitialView(): View {
  const v = getParam('view')
  return v && v in viewLabels ? (v as View) : 'dashboard'
}

export default function App() {
  const [view, setView] = useState<View>(loadInitialView)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => loadSelectedUserId())
  const [users, setUsers] = useState<User[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersLoadError, setUsersLoadError] = useState(false)
  const [needsFirstLaunchChoice, setNeedsFirstLaunchChoice] = useState(() => !hasMadeUserChoice())
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    fetchUsers()
      .then(u => { setUsers(u); setUsersLoaded(true) })
      .catch(() => { setUsersLoadError(true); setUsersLoaded(true) })
  }, [])

  const navigateToView = (v: View) => {
    setView(v)
    patchQueryParams({ view: v === 'dashboard' ? undefined : v })
  }

  const handleSelectUser = (userId: number | null) => {
    setSelectedUserId(userId)
    saveSelectedUserId(userId)
  }

  const handleFirstLaunchChoice = (userId: number) => {
    handleSelectUser(userId)
    setNeedsFirstLaunchChoice(false)
  }

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div className="min-h-screen p-5 max-w-5xl mx-auto">
      {needsFirstLaunchChoice && usersLoaded && (
        <FirstLaunchUserPrompt users={users} loadError={usersLoadError} onChoose={handleFirstLaunchChoice} />
      )}
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
            <IconButton
              aria-label="Settings"
              onClick={() => setMenuOpen(o => !o)}
              disabled={needsFirstLaunchChoice}
            >
              <Settings size={18} />
            </IconButton>
            {menuOpen && (
              <div className="absolute top-full right-0 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                {(Object.keys(viewLabels) as View[]).map(v => {
                  const Icon = viewIcons[v]
                  return (
                    <button
                      key={v}
                      onClick={() => { navigateToView(v); setMenuOpen(false) }}
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
      {view === 'accounts' && <AccountsList onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'categories' && <CategoriesList onBack={() => navigateToView('dashboard')} />}
      {view === 'transactions' && <TransactionsPage onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'users' && <UsersList onBack={() => navigateToView('dashboard')} onSelectUser={handleSelectUser} />}
      {view === 'split-settings' && <SplitWeightsSettings onBack={() => navigateToView('dashboard')} />}
      {view === 'import' && <CsvImportPage onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'backup' && <BackupPage onBack={() => navigateToView('dashboard')} />}
      {view === 'charts' && <ChartsPage onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}

      {menuOpen && (
        <div className="fixed inset-0 z-[1000]" onClick={() => setMenuOpen(false)} />
      )}
    </div>
  )
}
