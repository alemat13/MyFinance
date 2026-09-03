import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { ChartsData, fetchCharts } from '../api/client'
import { Card, Select, StatusMessage, BackButton } from './ui'
import { formatMoney } from '../utils/currency'

interface Props {
  selectedUserId: number | null
  onBack: () => void
}

const POSITIVE = 'var(--color-positive)'
const NEGATIVE = 'var(--color-negative)'
const UNCATEGORIZED = '#94a3b8'
const GRID_STROKE = 'var(--color-accent)'

function categoryBarColor(categoryType: 'Income' | 'Expense' | 'Uncategorized'): string {
  if (categoryType === 'Income') return POSITIVE
  if (categoryType === 'Expense') return NEGATIVE
  return UNCATEGORIZED
}
const AXIS_PROPS = { tick: { fontSize: 12, fill: 'currentColor' }, axisLine: false, tickLine: false }

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function ChartHeading({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{title}</h3>
}

export default function ChartsPage({ selectedUserId, onBack }: Props) {
  const [data, setData] = useState<ChartsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string | null>(null)

  useEffect(() => {
    if (selectedUserId == null) {
      setData(null)
      setError(null)
      return
    }
    setData(null)
    setError(null)
    fetchCharts(selectedUserId)
      .then(d => {
        setData(d)
        setCurrency(prev => (prev && d.currencies.includes(prev) ? prev : d.currencies[0] ?? null))
      })
      .catch(err => {
        console.error(err)
        setError(err.message)
      })
  }, [selectedUserId])

  const backButton = <BackButton onClick={onBack} />

  if (selectedUserId == null) {
    return (
      <div>
        {backButton}
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Charts</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Select a user above to view their charts.</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div>
        {backButton}
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Charts</h2>
        <StatusMessage loading={!data} error={error} />
      </div>
    )
  }

  const byCategory = data.by_category.filter(c => c.currency === currency)
  const byMonth = data.by_month.filter(m => m.currency === currency)
  const netByMonth = data.net_by_month.filter(n => n.currency === currency)
  const money = (v: number) => formatMoney(v, currency ?? '')
  const tooltipFormatter = (value: unknown) => money(Number(value ?? 0))

  return (
    <div>
      {backButton}
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Charts</h2>
        {data.currencies.length > 1 && (
          <Select value={currency ?? ''} onChange={e => setCurrency(e.target.value)}>
            {data.currencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        )}
      </div>

      {byCategory.length === 0 && byMonth.length === 0 ? (
        <p className="p-5 text-sm text-slate-500 dark:text-slate-400">No split transactions yet for this user.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <Card className="p-4">
            <ChartHeading title="Amounts by Category" />
            <div className="flex gap-3 mb-2">
              <Swatch color={POSITIVE} label="Income" />
              <Swatch color={NEGATIVE} label="Expense" />
              {byCategory.some(c => c.category_type === 'Uncategorized') && (
                <Swatch color={UNCATEGORIZED} label="Uncategorized" />
              )}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byCategory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} strokeOpacity={0.15} />
                <XAxis dataKey="category_name" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip formatter={tooltipFormatter} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
                <Bar dataKey="amount" name="Amount" maxBarSize={24} radius={[4, 4, 0, 0]}>
                  {byCategory.map(c => (
                    <Cell key={c.category_id ?? 'uncategorized'} fill={categoryBarColor(c.category_type)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <ChartHeading title="Income vs Expense by Month" />
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} strokeOpacity={0.15} />
                <XAxis dataKey="month" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip formatter={tooltipFormatter} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill={POSITIVE} maxBarSize={24} radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill={NEGATIVE} maxBarSize={24} radius={[4, 4, 0, 0]} />
                {byMonth.some(m => m.uncategorized !== 0) && (
                  <Bar dataKey="uncategorized" name="Uncategorized" fill={UNCATEGORIZED} maxBarSize={24} radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-4">
            <ChartHeading title="Net by Month" />
            <div className="flex gap-3 mb-2">
              <Swatch color={POSITIVE} label="Net positive" />
              <Swatch color={NEGATIVE} label="Net negative" />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={netByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} strokeOpacity={0.15} />
                <XAxis dataKey="month" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip formatter={tooltipFormatter} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
                <Bar dataKey="net" name="Net" maxBarSize={24} radius={[4, 4, 0, 0]}>
                  {netByMonth.map(n => (
                    <Cell key={n.month} fill={n.net >= 0 ? POSITIVE : NEGATIVE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  )
}
