export type CsvValue = string | number | boolean | null | undefined

export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map(row => row.map(escapeCsvField).join(','))
  return '﻿' + lines.join('\r\n')
}
