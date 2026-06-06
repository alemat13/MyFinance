import { useEffect, useState } from 'react'
import {
  Account, AccountCreate, AccountUpdate,
  fetchAccounts, createAccount, updateAccount, deleteAccount,
} from '../api/client'

interface Props {
  onBack: () => void
}

const emptyForm: AccountCreate = { name: '', type: '', balance: 0 }

export default function AccountsList({ onBack }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<AccountUpdate>({})
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<AccountCreate>(emptyForm)

  const load = () => {
    setLoading(true)
    fetchAccounts()
      .then(setAccounts)
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const startEdit = (a: Account) => {
    setEditingId(a.id)
    setEditData({ name: a.name, type: a.type, balance: a.balance })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = (id: number) => {
    updateAccount(id, editData)
      .then(() => { cancelEdit(); load() })
      .catch(err => alert(err.message))
  }

  const del = (id: number, name: string) => {
    if (!confirm(`Delete account "${name}"?`)) return
    deleteAccount(id)
      .then(() => load())
      .catch(err => alert(err.message))
  }

  const saveNew = () => {
    if (!newData.name || !newData.type) { alert('Name and type are required'); return }
    createAccount(newData)
      .then(() => { setShowNew(false); setNewData(emptyForm); load() })
      .catch(err => alert(err.message))
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewData(emptyForm)
  }

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>
        ← Back to Dashboard
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0 }}>Accounts</h2>
        <button onClick={() => setShowNew(true)} style={newBtnStyle}>
          + New Account
        </button>
      </div>

      {showNew && (
        <div style={{ padding: '12px', marginBottom: '12px', border: '1px solid #ccc', borderRadius: '6px', background: '#f9f9f9' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input placeholder="Name" value={newData.name} onChange={e => setNewData({ ...newData, name: e.target.value })} style={inputStyle} />
            <input placeholder="Type" value={newData.type} onChange={e => setNewData({ ...newData, type: e.target.value })} style={inputStyle} />
            <input placeholder="Balance" type="number" value={newData.balance} onChange={e => setNewData({ ...newData, balance: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: '100px' }} />
            <button onClick={saveNew} style={saveBtnStyle}>Save</button>
            <button onClick={cancelNew} style={cancelBtnStyle}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={{ padding: '20px' }}>Loading...</div>}

      {!loading && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ background: '#eee', textAlign: 'left' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Type</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>No accounts yet</td></tr>
            )}
            {accounts.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #ddd' }}>
                {editingId === a.id ? (
                  <>
                    <td style={tdStyle}><input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} style={inputStyle} /></td>
                    <td style={tdStyle}><input value={editData.type ?? ''} onChange={e => setEditData({ ...editData, type: e.target.value })} style={inputStyle} /></td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}><input type="number" value={editData.balance ?? 0} onChange={e => setEditData({ ...editData, balance: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: '100px', textAlign: 'right' }} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => saveEdit(a.id)} style={saveBtnStyle}>Save</button>
                      <button onClick={cancelEdit} style={cancelBtnStyle}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>{a.name}</td>
                    <td style={tdStyle}>{a.type}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: a.balance >= 0 ? 'green' : 'red' }}>
                      {a.balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => startEdit(a)} style={editBtnStyle}>Edit</button>
                      <button onClick={() => del(a.id, a.name)} style={delBtnStyle}>Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px',
}

const btnBase: React.CSSProperties = {
  border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
}

const newBtnStyle: React.CSSProperties = {
  ...btnBase, background: '#0066cc', color: '#fff',
}

const saveBtnStyle: React.CSSProperties = {
  ...btnBase, background: '#28a745', color: '#fff', marginRight: '4px',
}

const cancelBtnStyle: React.CSSProperties = {
  ...btnBase, background: '#6c757d', color: '#fff',
}

const editBtnStyle: React.CSSProperties = {
  ...btnBase, background: '#ffc107', color: '#333', marginRight: '4px',
}

const delBtnStyle: React.CSSProperties = {
  ...btnBase, background: '#dc3545', color: '#fff',
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', fontSize: '14px', marginBottom: '16px', padding: 0,
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '2px solid #ccc',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
}
