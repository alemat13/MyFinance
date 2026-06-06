import { useEffect, useState } from 'react'
import {
  Category, CategoryCreate, CategoryUpdate,
  fetchCategories, createCategory, updateCategory, deleteCategory,
} from '../api/client'

interface Props {
  onBack: () => void
}

const emptyForm: CategoryCreate = { name: '', type: '' }

export default function CategoriesList({ onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<CategoryUpdate>({})
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<CategoryCreate>(emptyForm)

  const load = () => {
    setLoading(true)
    fetchCategories()
      .then(setCategories)
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const startEdit = (c: Category) => {
    setEditingId(c.id)
    setEditData({ name: c.name, type: c.type })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = (id: number) => {
    updateCategory(id, editData)
      .then(() => { cancelEdit(); load() })
      .catch(err => alert(err.message))
  }

  const del = (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return
    deleteCategory(id)
      .then(() => load())
      .catch(err => alert(err.message))
  }

  const saveNew = () => {
    if (!newData.name || !newData.type) { alert('Name and type are required'); return }
    createCategory(newData)
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
        <h2 style={{ margin: 0 }}>Categories</h2>
        <button onClick={() => setShowNew(true)} style={newBtnStyle}>
          + New Category
        </button>
      </div>

      {showNew && (
        <div style={{ padding: '12px', marginBottom: '12px', border: '1px solid #ccc', borderRadius: '6px', background: '#f9f9f9' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input placeholder="Name" value={newData.name} onChange={e => setNewData({ ...newData, name: e.target.value })} style={inputStyle} />
            <input placeholder="Type (Income / Expense / Transfer)" value={newData.type} onChange={e => setNewData({ ...newData, type: e.target.value })} style={inputStyle} />
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
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>No categories yet</td></tr>
            )}
            {categories.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #ddd' }}>
                {editingId === c.id ? (
                  <>
                    <td style={tdStyle}><input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} style={inputStyle} /></td>
                    <td style={tdStyle}><input value={editData.type ?? ''} onChange={e => setEditData({ ...editData, type: e.target.value })} style={inputStyle} /></td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => saveEdit(c.id)} style={saveBtnStyle}>Save</button>
                      <button onClick={cancelEdit} style={cancelBtnStyle}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>{c.name}</td>
                    <td style={tdStyle}>{c.type}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => startEdit(c)} style={editBtnStyle}>Edit</button>
                      <button onClick={() => del(c.id, c.name)} style={delBtnStyle}>Delete</button>
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
