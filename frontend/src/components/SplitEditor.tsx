import { Plus, X } from 'lucide-react'
import { User } from '../api/client'
import { useToast } from '../context/ToastContext'
import { IconButton, Input, Select } from './ui'
import { formatMoney } from '../utils/currency'

export interface SplitRow {
  user_id: number
  value: number
}

interface Props {
  rows: SplitRow[]
  allUsers: User[]
  total: number
  unit: '%' | 'currency'
  currency?: string
  label: string
  onChange: (rows: SplitRow[]) => void
}

export default function SplitEditor({ rows, allUsers, total, unit, currency, label, onChange }: Props) {
  const { showToast } = useToast()

  const addRow = () => {
    const unused = allUsers.find(u => !rows.some(r => r.user_id === u.id))
    if (!unused) { showToast('No more users available'); return }
    onChange([...rows, { user_id: unused.id, value: 0 }])
  }

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx))
  }

  const updateRow = (idx: number, field: 'user_id' | 'value', value: number) => {
    onChange(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const totalSoFar = rows.reduce((s, r) => s + r.value, 0)
  const suffix = unit === '%' ? '%' : (currency ?? '')
  const mismatch = rows.length > 0 && Math.abs(totalSoFar - total) > 0.01
  const fmtTotal = (n: number) => unit === 'currency' && currency ? formatMoney(n, currency) : `${n}${suffix}`

  return (
    <div className="mt-2 p-2 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        <IconButton aria-label="Add user" onClick={addRow}>
          <Plus size={14} />
        </IconButton>
      </div>
      {rows.length === 0 && <span className="text-xs text-slate-400">None assigned</span>}
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1.5 items-center mb-1">
          <Select
            value={r.user_id}
            onChange={e => updateRow(i, 'user_id', parseInt(e.target.value, 10) || 0)}
            className="flex-1 min-w-[100px]"
          >
            <option value={0}>Select user</option>
            {allUsers.map(au => (
              <option key={au.id} value={au.id} disabled={rows.some(x => x.user_id === au.id && x.user_id !== r.user_id)}>
                {au.name}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            step={unit === '%' ? '0.1' : '0.01'}
            value={r.value}
            onChange={e => updateRow(i, 'value', parseFloat(e.target.value) || 0)}
            className="w-20 text-right"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">{suffix}</span>
          <IconButton aria-label="Remove row" onClick={() => removeRow(i)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      {rows.length > 0 && (
        <div className={`text-xs mt-1 ${mismatch ? 'text-negative' : 'text-slate-500 dark:text-slate-400'}`}>
          Total: {fmtTotal(totalSoFar)} (target {fmtTotal(total)})
        </div>
      )}
    </div>
  )
}
