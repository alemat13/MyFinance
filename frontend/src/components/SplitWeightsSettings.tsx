import { useEffect, useState } from 'react'
import { GlobalSplitWeight, fetchSplitWeights, updateSplitWeights } from '../api/client'

interface Props {
  onBack: () => void
}

export default function SplitWeightsSettings({ onBack }: Props) {
  const [weights, setWeights] = useState<GlobalSplitWeight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetchSplitWeights()
      .then(setWeights)
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const updateWeight = (userId: number, weight: number) => {
    setWeights(weights.map(w => w.user_id === userId ? { ...w, weight } : w))
  }

  const save = () => {
    if (weights.some(w => w.weight < 0)) { alert('Weights must be >= 0'); return }
    setSaving(true)
    updateSplitWeights(weights.map(w => ({ user_id: w.user_id, weight: w.weight })))
      .then(setWeights)
      .catch(err => alert(err.message))
      .finally(() => setSaving(false))
  }

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>
        ← Back to Dashboard
      </button>
      <h2 style={{ margin: '0 0 4px 0' }}>Split Weights</h2>
      <p style={{ fontSize: '13px', color: '#666', marginTop: 0 }}>
        The default fallback split for transactions with no category-specific split configured:
        each transaction's amount is divided proportionally to these relative weights (e.g. income-proportional).
      </p>

      {loading && <div style={{ padding: '20px' }}>Loading...</div>}

      {!loading && (
        <div style={{ padding: '12px', border: '1px solid #ddd', borderRadius: '6px', background: '#fff', maxWidth: '400px' }}>
          {weights.length === 0 && <span style={{ fontSize: '13px', color: '#999' }}>No users yet</span>}
          {weights.map(w => (
            <div key={w.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ flex: 1, fontSize: '13px' }}>{w.user_name}</span>
              <input
                type="number"
                min="0"
                step="1"
                value={w.weight}
                onChange={e => updateWeight(w.user_id, parseFloat(e.target.value) || 0)}
                style={{ ...inputStyle, width: '100px', textAlign: 'right' }}
              />
            </div>
          ))}
          {weights.length > 0 && (
            <button onClick={save} disabled={saving} style={saveBtnStyle}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px',
}

const saveBtnStyle: React.CSSProperties = {
  border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
  background: '#28a745', color: '#fff',
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', fontSize: '14px', marginBottom: '16px', padding: 0,
}
