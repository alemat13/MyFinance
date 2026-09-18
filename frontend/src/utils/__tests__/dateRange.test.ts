import { describe, test, expect } from 'vitest'
import { lastNMonthsRange, monthsBetween } from '../dateRange'

describe('lastNMonthsRange', () => {
  test('returns an inclusive n-month window ending in the given month', () => {
    expect(lastNMonthsRange(12, new Date('2026-09-18T12:00:00Z'))).toEqual({ start: '2025-10', end: '2026-09' })
  })

  test('handles a year rollover', () => {
    expect(lastNMonthsRange(3, new Date('2026-01-05T00:00:00Z'))).toEqual({ start: '2025-11', end: '2026-01' })
  })

  test('a 1-month window is just the current month', () => {
    expect(lastNMonthsRange(1, new Date('2026-06-01T00:00:00Z'))).toEqual({ start: '2026-06', end: '2026-06' })
  })
})

describe('monthsBetween', () => {
  test('returns every month inclusive of both ends', () => {
    expect(monthsBetween('2026-01', '2026-04')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
  })

  test('handles a year boundary', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  test('a single-month range returns one entry', () => {
    expect(monthsBetween('2026-05', '2026-05')).toEqual(['2026-05'])
  })

  test('an inverted range returns nothing', () => {
    expect(monthsBetween('2026-05', '2026-01')).toEqual([])
  })
})
