import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { MonthChartItem, NetMonthChartItem } from '../../api/client'
import { Card, Table, Tbody, Td, Th, Thead, Tr } from '../ui'
import { formatMoney } from '../../utils/currency'
import { monthsBetween } from '../../utils/dateRange'
import { useIsMobile } from '../../hooks/useMediaQuery'
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
  const isMobile = useIsMobile()
  // The summary table drops the cents on a phone so all its columns fit without scrolling.
  const cell = (v: number) => {
    if (!isMobile) return money(v)
    try {
      return v.toLocaleString('en-US', { style: 'currency', currency: currency ?? '', maximumFractionDigits: 0, minimumFractionDigits: 0 })
    } catch {
      return `${Math.round(v)} ${currency ?? ''}`
    }
  }

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

  // Averages are over every month of the range, an empty month counting as 0.
  const count = merged.length || 1
  const average = {
    income: merged.reduce((s, m) => s + m.income, 0) / count,
    expense: merged.reduce((s, m) => s + m.expense, 0) / count,
    uncategorized: merged.reduce((s, m) => s + m.uncategorized, 0) / count,
    net: merged.reduce((s, m) => s + m.net, 0) / count,
  }
  // Best and worst only mean something when the months actually differ.
  const nets = merged.map(m => m.net)
  const bestNet = Math.max(...nets)
  const worstNet = Math.min(...nets)
  const hasExtremes = merged.length > 1 && bestNet !== worstNet
  const netClass = (v: number) =>
    v < 0 ? 'text-red-600 dark:text-red-400' : v > 0 ? 'text-green-700 dark:text-green-400' : ''

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

      {!(byMonth.length === 0 && netByMonth.length === 0) && (
        <div className="mt-4">
          <Table aria-label="Net income per month summary" className="text-xs md:text-sm [&_td]:px-1.5 [&_th]:px-1.5 md:[&_td]:px-3 md:[&_th]:px-3">
            <Thead>
              <Tr>
                <Th>Month</Th>
                <Th className="text-right">Income</Th>
                <Th className="text-right">Expense</Th>
                {hasUncategorized && <Th className="text-right"><span className="md:hidden">Uncat.</span><span className="hidden md:inline">Uncategorized</span></Th>}
                <Th className="text-right">Net</Th>
              </Tr>
            </Thead>
            <Tbody>
              {merged.map(m => {
                const best = hasExtremes && m.net === bestNet
                const worst = hasExtremes && m.net === worstNet
                return (
                  <Tr key={m.month}>
                    <Td className="whitespace-nowrap">
                      {m.month}
                      {best && <span className="ml-1.5" role="img" aria-label="Best month" title="Best month">🏅</span>}
                      {worst && <span className="ml-1.5" role="img" aria-label="Worst month" title="Worst month">🔻</span>}
                    </Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">{cell(m.income)}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">{cell(m.expense)}</Td>
                    {hasUncategorized && (
                      <Td className="text-right whitespace-nowrap tabular-nums">{cell(m.uncategorized)}</Td>
                    )}
                    <Td className={`text-right whitespace-nowrap tabular-nums font-medium ${netClass(m.net)}`}>
                      {cell(m.net)}
                    </Td>
                  </Tr>
                )
              })}
              <Tr className="bg-slate-50 dark:bg-slate-800 font-semibold border-t-2">
                <Td className="whitespace-nowrap font-semibold">Average</Td>
                <Td className="text-right whitespace-nowrap tabular-nums font-semibold">{cell(average.income)}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums font-semibold">{cell(average.expense)}</Td>
                {hasUncategorized && (
                  <Td className="text-right whitespace-nowrap tabular-nums font-semibold">{cell(average.uncategorized)}</Td>
                )}
                <Td className={`text-right whitespace-nowrap tabular-nums font-semibold ${netClass(average.net)}`}>
                  {cell(average.net)}
                </Td>
              </Tr>
            </Tbody>
          </Table>
          {hasExtremes && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              🏅 best net month · 🔻 worst net month
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
