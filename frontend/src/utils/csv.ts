export type CsvValue = string | number | boolean | null | undefined

// A text cell starting with one of these is read as a formula by Excel and
// LibreOffice (CSV injection): a payee comes from the bank, so it is not ours
// to trust. Numbers are left alone, or every negative amount would turn to text.
const FORMULA_START = /^[=+\-@\t\r]/

export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (typeof value === 'string' && FORMULA_START.test(str)) str = `'${str}`
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map(row => row.map(escapeCsvField).join(','))
  return '﻿' + lines.join('\r\n')
}
