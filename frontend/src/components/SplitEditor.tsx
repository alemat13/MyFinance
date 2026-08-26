import { User } from '../api/client'

export interface SplitRow {
  user_id: number
  value: number
}

interface Props {
  rows: SplitRow[]
  allUsers: User[]
  total: number
  unit: '%' | 'currency'
  label: string
  onChange: (rows: SplitRow[]) => void
}

export default function SplitEditor({ rows, allUsers, total, unit, label, onChange }: Props) {
  const addRow = () => {
    const unused = allUsers.find(u => !rows.some(r => r.user_id === u.id))
    if (!unused) { alert('No more users available'); return }
    onChange([...rows, { user_id: unused.id, value: 0 }])
  }

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx))
  }

  const updateRow = (idx: number, field: 'user_id' | 'value', value: number) => {
    onChange(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const totalSoFar = rows.reduce((s, r) => s + r.value, 0)
  const suffix = unit === '%' ? '%' : ''
  const mismatch = rows.length > 0 && Math.abs(totalSoFar - total) > 0.01

  return (
    <div style={{ marginTop: '8px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{label}</span>
        <button onClick={addRow} style={{ ...btnBase, background: '#17a2b8', color: '#fff', fontSize: '11px', padding: '4px 8px' }}>
          + Add User
        </button>
      </div>
      {rows.length === 0 && <span style={{ fontSize: '12px', color: '#999' }}>None assigned</span>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
          <select
            value={r.user_id}
            onChange={e => updateRow(i, 'user_id', parseInt(e.target.value, 10) || 0)}
            style={{ ...inputStyle, flex: 1, minWidth: '100px' }}
          >
            <option value={0}>Select user</option>
            {allUsers.map(au => (
              <option key={au.id} value={au.id} disabled={rows.some(x => x.user_id === au.id && x.user_id !== r.user_id)}>
                {au.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step={unit === '%' ? '0.1' : '0.01'}
            value={r.value}
            onChange={e => updateRow(i, 'value', parseFloat(e.target.value) || 0)}
            style={{ ...inputStyle, width: '80px', textAlign: 'right' }}
          />
          <span style={{ fontSize: '12px' }}>{suffix}</span>
          <button onClick={() => removeRow(i)} style={{ ...btnBase, background: '#dc3545', color: '#fff', fontSize: '11px', padding: '4px 8px' }}>
            ✕
          </button>
        </div>
      ))}
      {rows.length > 0 && (
        <div style={{ fontSize: '12px', color: mismatch ? '#dc3545' : '#666', marginTop: '4px' }}>
          Total: {totalSoFar}{suffix} (target {total}{suffix})
        </div>
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
