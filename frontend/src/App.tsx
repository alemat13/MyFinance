import { useState } from 'react'
import Dashboard from './components/Dashboard'
import AccountsList from './components/AccountsList'
import CategoriesList from './components/CategoriesList'
import TransactionsPage from './components/TransactionsPage'

type View = 'dashboard' | 'accounts' | 'categories' | 'transactions'

const viewLabels: Record<View, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  categories: 'Categories',
  transactions: 'Transactions',
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <h1 style={{ margin: 0 }}>MyFinance</h1>
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

      {view === 'dashboard' && <Dashboard />}
      {view === 'accounts' && <AccountsList onBack={() => setView('dashboard')} />}
      {view === 'categories' && <CategoriesList onBack={() => setView('dashboard')} />}
      {view === 'transactions' && <TransactionsPage onBack={() => setView('dashboard')} />}

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
