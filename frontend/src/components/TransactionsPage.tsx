import { useEffect, useState } from 'react'
import {
  Transaction, TransactionCreate, TransactionUpdate,
  Account, Category,
  fetchTransactions, createTransaction, updateTransaction, deleteTransaction,
  fetchAccounts, fetchCategories,
} from '../api/client'

interface Props {
  onBack: () => void
  selectedUserId: number | null
}

const emptyForm: TransactionCreate = {
  date: new Date().toISOString().slice(0, 10),
  payee: '',
  memo: '',
  amount: 0,
  account_id: 0,
  category_id: 0,
}

export default function TransactionsPage({ onBack, selectedUserId }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<TransactionUpdate>({})
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<TransactionCreate>(emptyForm)

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      fetchTransactions(selectedUserId ?? undefined),
      fetchAccounts(selectedUserId ?? undefined),
      fetchCategories(),
    ])
      .then(([txns, accts, cats]) => {
        setTransactions(txns)
        setAccounts(accts)
        setCategories(cats)
      })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(loadAll, [selectedUserId])

  const startEdit = (t: Transaction) => {
    setEditingId(t.id)
    setEditData({
      date: t.date,
      payee: t.payee,
      memo: t.memo,
      amount: t.amount,
      account_id: t.account_id,
      category_id: t.category_id,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = (id: number) => {
    updateTransaction(id, editData)
      .then(() => { cancelEdit(); loadAll() })
      .catch(err => alert(err.message))
  }

  const del = (id: number, payee: string) => {
    if (!confirm(`Delete transaction "${payee}"?`)) return
    deleteTransaction(id)
      .then(() => loadAll())
      .catch(err => alert(err.message))
  }

  const saveNew = () => {
    if (!newData.payee || !newData.account_id || !newData.category_id) {
      alert('Payee, account, and category are required'); return
    }
    createTransaction(newData)
      .then(() => { setShowNew(false); setNewData(emptyForm); loadAll() })
      .catch(err => alert(err.message))
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewData(emptyForm)
  }

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
  const hasMemo = sorted.some(t => t.memo !== null)

  const acctOptions = accounts.map(a => ({ value: a.id, label: a.name }))
  const catOptions = categories.map(c => ({ value: c.id, label: `${c.name} (${c.type})` }))

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>
        ← Back to Dashboard
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0 }}>Transactions</h2>
        <button onClick={() => setShowNew(true)} style={newBtnStyle}>
          + New Transaction
        </button>
      </div>

      {showNew && (
        <div style={{ padding: '12px', marginBottom: '12px', border: '1px solid #ccc', borderRadius: '6px', background: '#f9f9f9' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input type="date" value={newData.date} onChange={e => setNewData({ ...newData, date: e.target.value })} style={inputStyle} />
            <input placeholder="Payee" value={newData.payee} onChange={e => setNewData({ ...newData, payee: e.target.value })} style={inputStyle} />
            <input placeholder="Memo" value={newData.memo ?? ''} onChange={e => setNewData({ ...newData, memo: e.target.value || null })} style={inputStyle} />
            <input placeholder="Amount" type="number" step="0.01" value={newData.amount} onChange={e => setNewData({ ...newData, amount: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: '110px' }} />
            <select value={newData.account_id} onChange={e => setNewData({ ...newData, account_id: parseInt(e.target.value) || 0 })} style={selectStyle}>
              <option value={0}>Account</option>
              {acctOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={newData.category_id} onChange={e => setNewData({ ...newData, category_id: parseInt(e.target.value) || 0 })} style={selectStyle}>
              <option value={0}>Category</option>
              {catOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
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
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Payee</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Account</th>
              {hasMemo && <th style={thStyle}>Memo</th>}
              <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={hasMemo ? 7 : 6} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>No transactions yet</td></tr>
            )}
            {sorted.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #ddd' }}>
                {editingId === t.id ? (
                  <>
                    <td style={tdStyle}><input type="date" value={editData.date ?? ''} onChange={e => setEditData({ ...editData, date: e.target.value })} style={inputStyle} /></td>
                    <td style={tdStyle}><input value={editData.payee ?? ''} onChange={e => setEditData({ ...editData, payee: e.target.value })} style={inputStyle} /></td>
                    <td style={tdStyle}>
                      <select value={editData.category_id ?? 0} onChange={e => setEditData({ ...editData, category_id: parseInt(e.target.value) || 0 })} style={selectStyle}>
                        <option value={0}>Category</option>
                        {catOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select value={editData.account_id ?? 0} onChange={e => setEditData({ ...editData, account_id: parseInt(e.target.value) || 0 })} style={selectStyle}>
                        <option value={0}>Account</option>
                        {acctOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    {hasMemo && (
                      <td style={tdStyle}><input value={editData.memo ?? ''} onChange={e => setEditData({ ...editData, memo: e.target.value || null })} style={inputStyle} /></td>
                    )}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input type="number" step="0.01" value={editData.amount ?? 0} onChange={e => setEditData({ ...editData, amount: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: '110px', textAlign: 'right' }} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => saveEdit(t.id)} style={saveBtnStyle}>Save</button>
                      <button onClick={cancelEdit} style={cancelBtnStyle}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>{t.date}</td>
                    <td style={tdStyle}>{t.payee}</td>
                    <td style={tdStyle}>{t.category_name}</td>
                    <td style={tdStyle}>{t.account_name}</td>
                    {hasMemo && <td style={tdStyle}>{t.memo ?? ''}</td>}
                    <td style={{ ...tdStyle, textAlign: 'right', color: t.amount >= 0 ? 'green' : 'red' }}>
                      {t.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <button onClick={() => startEdit(t)} style={editBtnStyle}>Edit</button>
                      <button onClick={() => del(t.id, t.payee)} style={delBtnStyle}>Delete</button>
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

const selectStyle: React.CSSProperties = {
  ...inputStyle, minWidth: '140px',
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
