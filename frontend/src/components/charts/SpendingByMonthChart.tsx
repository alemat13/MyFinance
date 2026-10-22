import {
  Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ChartCategoryOut, MonthCategoryChartItem, ParentCategoryOut } from '../../api/client'
import { Card } from '../ui'
import { formatMoney } from '../../utils/currency'
import { monthsBetween } from '../../utils/dateRange'
import { categoryDataKey, pivotMonthCategory } from './pivotMonthCategory'
import { AXIS_PROPS, GRID_STROKE, TREND_LINE, UNCATEGORIZED } from './chartTheme'

interface Props {
  items: MonthCategoryChartItem[]
  categories: ChartCategoryOut[]
  parentCategory: ParentCategoryOut | null
  startMonth: string
  endMonth: string
  currency: string | null
  onDrill: (categoryId: number) => void
  onBackToOverview: () => void
  // A segment's transactions: one category (null = Uncategorized) over one
  // month (a click on its bar) or over the whole range (null, from the legend).
  onOpenTransactions: (categoryId: number | null, month: string | null) => void
}

interface TooltipEntry {
  dataKey?: unknown
  name?: unknown
  value?: unknown
  color?: string
}

export default function SpendingByMonthChart({
  items, categories, parentCategory, startMonth, endMonth, currency, onDrill, onBackToOverview, onOpenTransactions,
}: Props) {
  const money = (v: number) => formatMoney(v, currency ?? '')
  const months = monthsBetween(startMonth, endMonth)
  const pivoted = pivotMonthCategory(items, categories, months)

  // In the overview a category opens its subcategories (plus what is filed on
  // the category itself); Uncategorized has none, so it opens its transactions,
  // as every segment of a drilled-down view does.
  const select = (categoryId: number | null, month: string | null) => {
    if (parentCategory == null && categoryId != null) onDrill(categoryId)
    else onOpenTransactions(categoryId, month)
  }

  // Biggest first, the zero segments left out, the month's total last.
  const renderTooltip = ({ active, payload, label }: { active?: boolean; payload?: readonly TooltipEntry[]; label?: unknown }) => {
    if (!active || !payload?.length) return null
    const rows = payload
      .filter(p => p.dataKey !== 'total' && Number(p.value ?? 0) !== 0)
      .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
    const total = payload.find(p => p.dataKey === 'total')
    return (
      <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs shadow-md">
        <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{String(label ?? '')}</div>
        {rows.map(p => (
          <div key={String(p.dataKey)} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{String(p.name ?? '')}</span>
            <span className="tabular-nums">{money(Number(p.value ?? 0))}</span>
          </div>
        ))}
        {total && (
          <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100">
            <span>Total</span>
            <span className="tabular-nums">{money(Number(total.value ?? 0))}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-sm mb-1">
        {parentCategory ? (
          <button
            type="button"
            onClick={onBackToOverview}
            className="font-semibold text-accent hover:underline"
          >
            Overview
          </button>
        ) : (
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Spending per month</h3>
        )}
        {parentCategory && (
          <>
            <span className="text-slate-400">&gt;</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{parentCategory.name}</span>
          </>
        )}
      </div>
      {items.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          {parentCategory
            ? 'Click a subcategory to see its transactions. Money back (refunds) shows below zero.'
            : 'Click a category to see its subcategories. Money back (refunds) shows below zero.'}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No spending data for this range.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={pivoted} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} strokeOpacity={0.15} />
              <XAxis dataKey="month" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} />
              <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.4} />
              <Tooltip content={renderTooltip} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
              {categories.map(c => (
                <Bar
                  key={categoryDataKey(c.category_id)}
                  dataKey={categoryDataKey(c.category_id)}
                  name={c.name}
                  stackId="spend"
                  fill={c.color ?? UNCATEGORIZED}
                  maxBarSize={24}
                  cursor="pointer"
                  onClick={(entry: { payload?: { month?: string } }) => select(c.category_id, entry?.payload?.month ?? null)}
                />
              ))}
              <Line dataKey="total" name="Total" stroke={TREND_LINE} dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap gap-2 mt-3">
            {categories.map(c => (
              <button
                key={categoryDataKey(c.category_id)}
                type="button"
                onClick={() => select(c.category_id, null)}
                className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-1 border border-transparent text-slate-600 dark:text-slate-300 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color ?? UNCATEGORIZED }} />
                {c.name}
                {parentCategory && c.category_id === parentCategory.id && (
                  <span className="text-slate-400"> (directly)</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
