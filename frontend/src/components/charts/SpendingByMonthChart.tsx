import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
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
}

export default function SpendingByMonthChart({
  items, categories, parentCategory, startMonth, endMonth, currency, onDrill, onBackToOverview,
}: Props) {
  const money = (v: number) => formatMoney(v, currency ?? '')
  const tooltipFormatter = (value: unknown) => money(Number(value ?? 0))
  const months = monthsBetween(startMonth, endMonth)
  const pivoted = pivotMonthCategory(items, categories, months)

  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-sm mb-3">
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

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No spending data for this range.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={pivoted} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} strokeOpacity={0.15} />
              <XAxis dataKey="month" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} />
              <Tooltip formatter={tooltipFormatter} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
              {categories.map(c => (
                <Bar
                  key={categoryDataKey(c.category_id)}
                  dataKey={categoryDataKey(c.category_id)}
                  name={c.name}
                  stackId="spend"
                  fill={c.color ?? UNCATEGORIZED}
                  maxBarSize={24}
                />
              ))}
              <Line dataKey="total" name="Total" stroke={TREND_LINE} dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap gap-2 mt-3">
            {categories.map(c => {
              const clickable = c.category_id != null && parentCategory == null
              return (
                <button
                  key={categoryDataKey(c.category_id)}
                  type="button"
                  disabled={!clickable}
                  onClick={() => c.category_id != null && onDrill(c.category_id)}
                  className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-1 border border-transparent text-slate-600 dark:text-slate-300 ${
                    clickable
                      ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'cursor-default'
                  }`}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color ?? UNCATEGORIZED }} />
                  {c.name}
                </button>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
