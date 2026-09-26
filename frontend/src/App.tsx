import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { fetchUsers, User } from './api/client'
import { useTheme } from './context/ThemeContext'
import { getParam, navigateQueryParams } from './utils/urlState'
import { IconButton, Select } from './components/ui'
import NavShell from './components/NavShell'
import { View, viewLabels } from './nav'
import Dashboard from './components/Dashboard'
import FirstLaunchUserPrompt from './components/FirstLaunchUserPrompt'
import AccountsList from './components/AccountsList'
import CategoriesList from './components/CategoriesList'
import TransactionsPage from './components/TransactionsPage'
import UsersList from './components/UsersList'
import SplitWeightsSettings from './components/SplitWeightsSettings'
import CsvImportPage from './components/CsvImportPage'
import BackupPage from './components/BackupPage'
import BankSyncPage from './components/BankSyncPage'
import ChartsPage from './components/ChartsPage'
import HelpPage from './components/HelpPage'

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

  // Back/forward (browser button, Android back gesture) restores the view from the URL.
  useEffect(() => {
    const onPopState = () => setView(loadInitialView())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigateToView = (v: View) => {
    if (v === view) return
    setView(v)
    navigateQueryParams({ view: v === 'dashboard' ? undefined : v })
  }

  // Jumps from a Dashboard account tile to the Transactions view filtered on that
  // account. TransactionsPage reads its filters from the query string on mount, so
  // we set account_id (and clear every other simple/advanced filter, which may be
  // left over from an earlier visit) before switching the view.
  const navigateToAccountTransactions = (accountId: number) => {
    navigateQueryParams({
      view: 'transactions',
      account_id: String(accountId),
      mode: undefined,
      q: undefined,
      date_from: undefined,
      date_to: undefined,
      category_id: undefined,
      amount_min: undefined,
      amount_max: undefined,
      reconciled: undefined,
      match: undefined,
      conditions: undefined,
      page: undefined,
      transaction: undefined,
    })
    setView('transactions')
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
    <div className="min-h-screen p-4 pb-bottom-nav md:p-5 md:pb-5 md:max-w-5xl md:mx-auto">
      {needsFirstLaunchChoice && usersLoaded && (
        <FirstLaunchUserPrompt users={users} loadError={usersLoadError} onChoose={handleFirstLaunchChoice} />
      )}
      <div className="flex justify-between items-center gap-3 mb-4 md:mb-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 shrink-0">MyFinance</h1>
        <div className="flex items-center gap-2">
          <Select
            value={selectedUserId ?? ''}
            onChange={e => handleSelectUser(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="min-w-[110px] md:min-w-[120px]"
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
          <IconButton aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
        </div>
      </div>

      <div className="mb-4 md:mb-5">
        <NavShell view={view} onNavigate={navigateToView} disabled={needsFirstLaunchChoice} />
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

      {view === 'dashboard' && <Dashboard selectedUserId={selectedUserId} onSelectAccount={navigateToAccountTransactions} />}
      {view === 'accounts' && <AccountsList onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'categories' && <CategoriesList onBack={() => navigateToView('dashboard')} />}
      {view === 'transactions' && <TransactionsPage onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'users' && <UsersList onBack={() => navigateToView('dashboard')} onSelectUser={handleSelectUser} />}
      {view === 'split-settings' && <SplitWeightsSettings onBack={() => navigateToView('dashboard')} />}
      {view === 'import' && <CsvImportPage onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'bank-sync' && <BankSyncPage onBack={() => navigateToView('dashboard')} />}
      {view === 'backup' && <BackupPage onBack={() => navigateToView('dashboard')} />}
      {view === 'charts' && <ChartsPage onBack={() => navigateToView('dashboard')} selectedUserId={selectedUserId} />}
      {view === 'help' && <HelpPage onBack={() => navigateToView('dashboard')} />}
    </div>
  )
}
