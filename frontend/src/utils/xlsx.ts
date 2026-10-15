import type { CsvValue } from './csv'

// Excel number formats for columns that hold dates as ISO text: "YYYY-MM-DD"
// (a day) or "YYYY-MM" (a month, written as its first day).
export type XlsxDateColumns = Record<string, string>

// "2026-10-05" or "2026-10" → a UTC Date, or null when it isn't one of those.
function parseIsoDate(value: CsvValue): Date | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1))
}

export async function buildXlsxBlob(
  headers: string[],
  rows: CsvValue[][],
  dateColumns: XlsxDateColumns = {},
): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const formats = headers.map(h => dateColumns[h])
  const body = rows.map(row => row.map((value, i) => {
    const format = formats[i]
    const date = format ? parseIsoDate(value) : null
    return date ? { value: date, type: Date, format } : value
  }))
  return writeExcelFile([headers, ...body]).toBlob()
}
