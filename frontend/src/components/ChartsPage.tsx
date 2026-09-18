import { useEffect, useState } from 'react'
import { ChartsData, fetchCharts } from '../api/client'
import { Card, Input, Select, StatusMessage, BackButton } from './ui'
import { getParam, patchQueryParams } from '../utils/urlState'
import { lastNMonthsRange } from '../utils/dateRange'
import SpendingByMonthChart from './charts/SpendingByMonthChart'
import NetIncomeByMonthChart from './charts/NetIncomeByMonthChart'

interface Props {
  selectedUserId: number | null
  onBack: () => void
}

export default function ChartsPage({ selectedUserId, onBack }: Props) {
  const [data, setData] = useState<ChartsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string | null>(() => getParam('currency'))
  const [startMonth, setStartMonth] = useState(() => getParam('start_month') ?? lastNMonthsRange(12).start)
  const [endMonth, setEndMonth] = useState(() => getParam('end_month') ?? lastNMonthsRange(12).end)
  const [parentCategoryId, setParentCategoryId] = useState<number | null>(() => {
    const raw = getParam('parent_category_id')
    return raw ? Number(raw) : null
  })

  // A different user's drilldown state shouldn't carry over.
  useEffect(() => {
    setParentCategoryId(null)
  }, [selectedUserId])

  useEffect(() => {
    if (selectedUserId == null) {
      setData(null)
      setError(null)
      return
    }
    if (startMonth > endMonth) {
      setData(null)
      setError('"From" must not be after "To".')
      return
    }
    setError(null)
    // Fetches every currency at once (like every other multi-currency view
    // in the app) and filters to the selected one client-side below, rather
    // than sending `currency` as a query param - that would make picking a
    // currency re-trigger this same effect and double-fetch on every load.
    fetchCharts(selectedUserId, {
      startMonth,
      endMonth,
      parentCategoryId: parentCategoryId ?? undefined,
    })
      .then(d => {
        setData(d)
        setCurrency(prev => (prev && d.currencies.includes(prev) ? prev : d.currencies[0] ?? null))
      })
      .catch(err => {
        console.error(err)
        setError(err.message)
      })
  }, [selectedUserId, startMonth, endMonth, parentCategoryId])

  useEffect(() => {
    patchQueryParams({
      currency: currency ?? undefined,
      start_month: startMonth,
      end_month: endMonth,
      parent_category_id: parentCategoryId != null ? String(parentCategoryId) : undefined,
    })
  }, [currency, startMonth, endMonth, parentCategoryId])

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

  const filterBar = (
    <Card className="p-4 mb-5 flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        From
        <Input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        To
        <Input type="month" value={endMonth} onChange={e => setEndMonth(e.target.value)} />
      </label>
      {data && data.currencies.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Currency
          <Select value={currency ?? ''} onChange={e => setCurrency(e.target.value)}>
            {data.currencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </label>
      )}
    </Card>
  )

  return (
    <div>
      {backButton}
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Charts</h2>
      {filterBar}

      {error || !data ? (
        <StatusMessage loading={!error && !data} error={error} />
      ) : (
        (() => {
          const byMonthCategory = data.by_month_category.filter(m => m.currency === currency)
          const presentCategoryIds = new Set(byMonthCategory.map(m => m.category_id))
          const chartCategories = data.chart_categories.filter(c => presentCategoryIds.has(c.category_id))
          return (
            <div className="flex flex-col gap-5">
              <SpendingByMonthChart
                items={byMonthCategory}
                categories={chartCategories}
                parentCategory={data.parent_category}
                startMonth={startMonth}
                endMonth={endMonth}
                currency={currency}
                onDrill={setParentCategoryId}
                onBackToOverview={() => setParentCategoryId(null)}
              />
              <NetIncomeByMonthChart
                byMonth={data.by_month.filter(m => m.currency === currency)}
                netByMonth={data.net_by_month.filter(n => n.currency === currency)}
                startMonth={startMonth}
                endMonth={endMonth}
                currency={currency}
              />
            </div>
          )
        })()
      )}
    </div>
  )
}
