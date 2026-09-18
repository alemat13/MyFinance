import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { MonthChartItem, NetMonthChartItem } from '../../api/client'
import { Card } from '../ui'
import { formatMoney } from '../../utils/currency'
import { monthsBetween } from '../../utils/dateRange'
import { AXIS_PROPS, GRID_STROKE, NEGATIVE, POSITIVE, TREND_LINE, UNCATEGORIZED } from './chartTheme'

interface Props {
  byMonth: MonthChartItem[]
  netByMonth: NetMonthChartItem[]
  startMonth: string
  endMonth: string
  currency: string | null
}

export default function NetIncomeByMonthChart({ byMonth, netByMonth, startMonth, endMonth, currency }: Props) {
  const money = (v: number) => formatMoney(v, currency ?? '')
  const tooltipFormatter = (value: unknown) => money(Number(value ?? 0))
  const months = monthsBetween(startMonth, endMonth)

  const byMonthMap = new Map(byMonth.map(m => [m.month, m]))
  const netByMonthMap = new Map(netByMonth.map(n => [n.month, n]))
  const merged = months.map(month => ({
    month,
    income: byMonthMap.get(month)?.income ?? 0,
    expense: byMonthMap.get(month)?.expense ?? 0,
    uncategorized: byMonthMap.get(month)?.uncategorized ?? 0,
    net: netByMonthMap.get(month)?.net ?? 0,
  }))
  const hasUncategorized = merged.some(m => m.uncategorized !== 0)

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">Net income per month</h3>

      {byMonth.length === 0 && netByMonth.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No income or expense data for this range.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={merged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} strokeOpacity={0.15} />
            <XAxis dataKey="month" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip formatter={tooltipFormatter} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Income" fill={POSITIVE} maxBarSize={24} radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Expense" fill={NEGATIVE} maxBarSize={24} radius={[4, 4, 0, 0]} />
            {hasUncategorized && (
              <Bar dataKey="uncategorized" name="Uncategorized" fill={UNCATEGORIZED} maxBarSize={24} radius={[4, 4, 0, 0]} />
            )}
            <Line dataKey="net" name="Net" stroke={TREND_LINE} dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
