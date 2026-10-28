import { AccountValuePoint } from '../api/client'

export type ValuePeriod = '1M' | '6M' | '1Y' | 'ALL'
export const VALUE_PERIODS: ValuePeriod[] = ['1M', '6M', '1Y', 'ALL']
export const VALUE_PERIOD_LABELS: Record<ValuePeriod, string> = { '1M': '1M', '6M': '6M', '1Y': '1Y', ALL: 'All' }

export interface ValueChartPoint {
  /** Midnight UTC of the day, in ms, for a time axis. */
  t: number
  date: string
  value: number
  contributions: number
}

export interface ValueSummary {
  /** First day the figures cover: the period's start, or the account's first movement. */
  startDate: string | null
  endDate: string | null
  value: number
  /** Money paid in (minus money taken out) over the period. */
  paidIn: number
  /** Value change over the period that isn't money paid in: the checkpoints' gains and losses. */
  gain: number
  points: ValueChartPoint[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`)
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

/** The first day a period covers, counted back from `today` ("YYYY-MM-DD"); null for All. */
export function periodStart(period: ValuePeriod, today: string): string | null {
  if (period === 'ALL') return null
  const months = period === '1M' ? 1 : period === '6M' ? 6 : 12
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - months)
  return isoDay(d.getTime())
}

/** An account's value and paid-in lines over a period, scaled to the user's
 *  ownership share (`percentage`, 100 for the whole account), plus what the
 *  header reports: the value at the end, and how much of its change over the
 *  period was paid in and how much was gained. The lines start from the
 *  account's position the day before the period (when it already existed)
 *  and run to `today`, since a balance holds until the next movement. */
export function summarizeAccountValue(
  points: AccountValuePoint[],
  period: ValuePeriod,
  today: string,
  percentage = 100,
): ValueSummary {
  const k = percentage / 100
  const scaled = points.map(p => ({ date: p.date, value: p.value * k, contributions: p.contributions * k }))
  const start = periodStart(period, today)
  const before = start ? scaled.filter(p => p.date < start) : []
  const baseline = before.length > 0 ? before[before.length - 1] : null
  const inside = start ? scaled.filter(p => p.date >= start) : scaled

  const chart: ValueChartPoint[] = []
  const push = (date: string, value: number, contributions: number) =>
    chart.push({ t: toTime(date), date, value: round2(value), contributions: round2(contributions) })
  if (baseline && start && (inside.length === 0 || inside[0].date > start)) push(start, baseline.value, baseline.contributions)
  for (const p of inside) push(p.date, p.value, p.contributions)
  const last = chart[chart.length - 1]
  if (last && last.date < today) push(today, last.value, last.contributions)

  const end = last ?? null
  const value = end ? end.value : 0
  const paidIn = round2((end ? end.contributions : 0) - (baseline ? baseline.contributions : 0))
  const gain = round2(value - (baseline ? baseline.value : 0) - paidIn)
  return {
    startDate: chart.length > 0 ? chart[0].date : null,
    endDate: chart.length > 0 ? chart[chart.length - 1].date : null,
    value: round2(value),
    paidIn,
    gain,
    points: chart,
  }
}
