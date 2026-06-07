import { useEffect, useState } from 'react'
import {
  User, UserCreate, UserUpdate,
  fetchUsers, createUser, updateUser, deleteUser,
} from '../api/client'

interface Props {
  onBack: () => void
  onSelectUser: (userId: number | null) => void
}

const emptyForm: UserCreate = { name: '', email: '' }

export default function UsersList({ onBack, onSelectUser }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<UserUpdate>({})
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<UserCreate>(emptyForm)

  const load = () => {
    setLoading(true)
    fetchUsers()
      .then(setUsers)
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const startEdit = (u: User) => {
    setEditingId(u.id)
    setEditData({ name: u.name, email: u.email })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = (id: number) => {
    updateUser(id, editData)
      .then(() => { cancelEdit(); load() })
      .catch(err => alert(err.message))
  }

  const del = (id: number, name: string) => {
    if (!confirm(`Delete user "${name}"?`)) return
    deleteUser(id)
      .then(() => load())
      .catch(err => alert(err.message))
  }

  const saveNew = () => {
    if (!newData.name) { alert('Name is required'); return }
    createUser(newData)
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
        <h2 style={{ margin: 0 }}>Users</h2>
        <button onClick={() => setShowNew(true)} style={newBtnStyle}>
          + New User
        </button>
      </div>

      {showNew && (
        <div style={{ padding: '12px', marginBottom: '12px', border: '1px solid #ccc', borderRadius: '6px', background: '#f9f9f9' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input placeholder="Name" value={newData.name} onChange={e => setNewData({ ...newData, name: e.target.value })} style={inputStyle} />
            <input placeholder="Email" type="email" value={newData.email ?? ''} onChange={e => setNewData({ ...newData, email: e.target.value || null })} style={inputStyle} />
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
              <th style={thStyle}>Email</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>No users yet</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #ddd' }}>
                {editingId === u.id ? (
                  <>
                    <td style={tdStyle}><input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} style={inputStyle} /></td>
                    <td style={tdStyle}><input value={editData.email ?? ''} onChange={e => setEditData({ ...editData, email: e.target.value || null })} style={inputStyle} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => saveEdit(u.id)} style={saveBtnStyle}>Save</button>
                      <button onClick={cancelEdit} style={cancelBtnStyle}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>
                      <button
                        onClick={() => onSelectUser(u.id)}
                        style={{ background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
                        title="Filter by this user"
                      >
                        {u.name}
                      </button>
                    </td>
                    <td style={tdStyle}>{u.email ?? ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => startEdit(u)} style={editBtnStyle}>Edit</button>
                      <button onClick={() => del(u.id, u.name)} style={delBtnStyle}>Delete</button>
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
