import { test, expect } from 'vitest'
import { escapeCsvField, buildCsv } from '../csv'

test('escapeCsvField leaves plain values untouched', () => {
  expect(escapeCsvField('Grocery Store')).toBe('Grocery Store')
  expect(escapeCsvField(42)).toBe('42')
  expect(escapeCsvField(true)).toBe('true')
})

test('escapeCsvField returns empty string for null/undefined', () => {
  expect(escapeCsvField(null)).toBe('')
  expect(escapeCsvField(undefined)).toBe('')
})

test('escapeCsvField quotes and doubles internal quotes for commas, quotes, and newlines', () => {
  expect(escapeCsvField('Smith, John')).toBe('"Smith, John"')
  expect(escapeCsvField('Say "hi"')).toBe('"Say ""hi"""')
  expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
  expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"')
})

test('buildCsv joins headers and rows with CRLF and a leading BOM', () => {
  const csv = buildCsv(['Name', 'Amount'], [['Coffee', 3.5], ['Rent, Utilities', 1200]])
  expect(csv).toBe('﻿Name,Amount\r\nCoffee,3.5\r\n"Rent, Utilities",1200')
})
