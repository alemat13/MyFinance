import { useEffect, useState } from 'react'
import { fetchUsers, User } from './api/client'
import Dashboard from './components/Dashboard'
import AccountsList from './components/AccountsList'
import CategoriesList from './components/CategoriesList'
import TransactionsPage from './components/TransactionsPage'
import UsersList from './components/UsersList'

type View = 'dashboard' | 'accounts' | 'categories' | 'transactions' | 'users'

const viewLabels: Record<View, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  categories: 'Categories',
  transactions: 'Transactions',
  users: 'Users',
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

  useEffect(() => {
    fetchUsers().then(setUsers).catch(() => {})
  }, [])

  const handleSelectUser = (userId: number | null) => {
    setSelectedUserId(userId)
    saveSelectedUserId(userId)
  }

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <h1 style={{ margin: 0 }}>MyFinance</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={selectedUserId ?? ''}
            onChange={e => handleSelectUser(e.target.value ? parseInt(e.target.value, 10) : null)}
            style={{
              padding: '6px 8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px',
              background: '#fff',
              minWidth: '120px',
            }}
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <div style={{ position: 'relative', zIndex: 1001 }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
              }}
              aria-label="Settings"
            >
              ⚙️
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                minWidth: '160px',
                overflow: 'hidden',
              }}>
                {(Object.keys(viewLabels) as View[]).map(v => (
                  <button
                    key={v}
                    onClick={() => { setView(v); setMenuOpen(false) }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '10px 16px',
                      background: view === v ? '#eee' : 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '14px',
                      textTransform: 'capitalize' as const,
                    }}
                  >
                    {viewLabels[v]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedUserId && selectedUser && (
        <div style={{ marginBottom: '12px', fontSize: '13px', color: '#555' }}>
          Filtering by: <strong>{selectedUser.name}</strong>{' '}
          <button
            onClick={() => handleSelectUser(null)}
            style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', fontSize: '13px', padding: 0, textDecoration: 'underline' }}
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

      {menuOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
          }}
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  )
}
