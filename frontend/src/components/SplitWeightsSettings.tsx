import { useEffect, useState } from 'react'
import { GlobalSplitWeight, fetchSplitWeights, updateSplitWeights } from '../api/client'
import { useToast } from '../context/ToastContext'
import { Button, Input, Card, StatusMessage, BackButton } from './ui'

interface Props {
  onBack: () => void
}

export default function SplitWeightsSettings({ onBack }: Props) {
  const [weights, setWeights] = useState<GlobalSplitWeight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

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
    if (weights.some(w => w.weight < 0)) { showToast('Weights must be >= 0'); return }
    setSaving(true)
    updateSplitWeights(weights.map(w => ({ user_id: w.user_id, weight: w.weight })))
      .then(setWeights)
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Split Weights</h2>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0 mb-4">
        The lowest-priority default: used only to prefill a transaction's own split weights
        when no account- or category-specific weight is configured. Integer, relative weights
        (e.g. income-proportional) — no need to sum to any particular total.
      </p>

      <StatusMessage loading={loading} />

      {!loading && (
        <Card className="p-3 max-w-md">
          {weights.length === 0 && <span className="text-[13px] text-slate-400">No users yet</span>}
          {weights.map(w => (
            <div key={w.user_id} className="flex items-center gap-2 mb-2">
              <span className="flex-1 text-[13px] text-slate-700 dark:text-slate-200">{w.user_name}</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={w.weight}
                onChange={e => updateWeight(w.user_id, parseInt(e.target.value, 10) || 0)}
                className="w-[100px] text-right"
              />
            </div>
          ))}
          {weights.length > 0 && (
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
