import { test, expect } from 'vitest'
import { readSheet } from 'read-excel-file/universal'
import { buildXlsxBlob } from '../xlsx'

test('buildXlsxBlob produces a workbook with matching headers and rows', async () => {
  const blob = await buildXlsxBlob(
    ['Name', 'Amount', 'Note'],
    [['Coffee', 3.5, null], ['Rent, Utilities', 1200, undefined]],
  )

  expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  const rows = await readSheet(blob)

  expect(rows[0]).toEqual(['Name', 'Amount', 'Note'])
  expect(rows[1]).toEqual(['Coffee', 3.5, null])
  expect(rows[2]).toEqual(['Rent, Utilities', 1200, null])
})

test('buildXlsxBlob keeps numeric values as real numbers, not text', async () => {
  const blob = await buildXlsxBlob(['Amount'], [[42]])

  const rows = await readSheet(blob)

  expect(rows[1][0]).toBe(42)
  expect(typeof rows[1][0]).toBe('number')
})

test('buildXlsxBlob writes ISO date columns as real Excel dates', async () => {
  const blob = await buildXlsxBlob(
    ['Date', 'Accounting Month', 'Payee'],
    [['2026-10-05', '2026-09', '2026-10-05'], ['', null, 'x']],
    { Date: 'dd/mm/yyyy', 'Accounting Month': 'mm/yyyy' },
  )

  const rows = await readSheet(blob)

  expect(rows[1][0]).toEqual(new Date(Date.UTC(2026, 9, 5)))
  expect(rows[1][1]).toEqual(new Date(Date.UTC(2026, 8, 1)))
  expect(rows[1][2]).toBe('2026-10-05')
  expect(rows[2][0]).toBeNull()
})
