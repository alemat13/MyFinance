/** "YYYY-MM" for a given (0-indexed) total month count since year 0, mirroring
 * backend/accounting_month.py's year*12+month arithmetic so date-range
 * boundaries computed here and there never drift apart. */
function formatMonth(total: number): string {
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function monthIndex(ym: string): number {
  const [year, month] = ym.split('-').map(Number)
  return year * 12 + (month - 1)
}

/** Rolling n-month window ending in today's month, inclusive on both ends. */
export function lastNMonthsRange(n: number, today: Date = new Date()): { start: string; end: string } {
  const end = today.getFullYear() * 12 + today.getMonth()
  const start = end - (n - 1)
  return { start: formatMonth(start), end: formatMonth(end) }
}

/** Every "YYYY-MM" from start to end, inclusive. Empty if start is after end. */
export function monthsBetween(start: string, end: string): string[] {
  const startIdx = monthIndex(start)
  const endIdx = monthIndex(end)
  const months: string[] = []
  for (let i = startIdx; i <= endIdx; i++) months.push(formatMonth(i))
  return months
}
