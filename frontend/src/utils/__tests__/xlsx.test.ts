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
