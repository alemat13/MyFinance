import { useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AccountValuePoint } from '../../api/client'
import { Card } from '../ui'
import { formatMoney } from '../../utils/currency'
import { summarizeAccountValue, ValuePeriod, VALUE_PERIODS, VALUE_PERIOD_LABELS } from '../../utils/accountValue'
import { cn } from '../../lib/utils'
import { AXIS_PROPS, GRID_STROKE } from './chartTheme'

export const VALUE_COLOR = '#3b82f6'
export const PAID_IN_COLOR = '#eab308'

interface Props {
  accountId: number
  name: string
  currency: string
  points: AccountValuePoint[]
  /** The user's ownership share of the account, 100 for the whole of it. */
  percentage: number
  today: string
}

const formatDay = (date: string | null) =>
  date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''

const compact = (v: number, currency: string) => {
  try {
    return v.toLocaleString('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
  } catch {
    return String(Math.round(v))
  }
}

const signed = (v: number, currency: string) => `${v > 0 ? '+' : ''}${formatMoney(v, currency)}`

/** One account's value (its balance, which its checkpoints set) against the
 *  money paid into it, over a period picked under the chart. */
export default function AccountValueChart({ accountId, name, currency, points, percentage, today }: Props) {
  const [period, setPeriod] = useState<ValuePeriod>('ALL')
  const summary = summarizeAccountValue(points, period, today, percentage)
  const gradientId = `account-value-${accountId}`

  return (
    <Card className="p-4" role="region" aria-label={`${name} value`}>
      <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
        {name}
        {percentage < 100 && (
          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">your share: {percentage}%</span>
        )}
      </h4>
      <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-1">{formatMoney(summary.value, currency)}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDay(summary.endDate ?? today)}</p>

      {summary.points.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">No transactions on this account yet.</p>
      ) : (
        <>
          <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              {period === 'ALL' ? 'Since the account opened' : formatDay(summary.startDate)} → {formatDay(summary.endDate)}
            </p>
            <div className="grid grid-cols-2 gap-2 px-3 py-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PAID_IN_COLOR }} />Paid in
                </p>
                <p className="font-semibold tabular-nums">{signed(summary.paidIn, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Gain / loss</p>
                <p className={cn('font-semibold tabular-nums', summary.gain < 0 ? 'text-red-600 dark:text-red-400' : summary.gain > 0 ? 'text-green-700 dark:text-green-400' : '')}>
                  {signed(summary.gain, currency)}
                </p>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240} className="mt-3">
            <ComposedChart data={summary.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VALUE_COLOR} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={VALUE_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} strokeOpacity={0.15} />
              <XAxis
                dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                ticks={[summary.points[0].t, summary.points[summary.points.length - 1].t]}
                tickFormatter={(t: number) => formatDay(new Date(t).toISOString().slice(0, 10))}
                {...AXIS_PROPS}
              />
              <YAxis width={56} tickFormatter={(v: number) => compact(v, currency)} {...AXIS_PROPS} />
              <Tooltip
                labelFormatter={(t) => formatDay(new Date(Number(t)).toISOString().slice(0, 10))}
                formatter={(v) => formatMoney(Number(v ?? 0), currency)}
              />
              <Area
                dataKey="value" name="Value" type="stepAfter" stroke={VALUE_COLOR} strokeWidth={2}
                fill={`url(#${gradientId})`} dot={false} isAnimationActive={false}
              />
              <Line
                dataKey="contributions" name="Paid in" type="stepAfter" stroke={PAID_IN_COLOR} strokeWidth={2}
                dot={false} isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}

      <div className="mt-3 flex gap-1" role="group" aria-label="Period">
        {VALUE_PERIODS.map(p => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={cn(
              'flex-1 rounded-full px-3 py-1 text-sm cursor-pointer',
              period === p
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            {VALUE_PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
    </Card>
  )
}
