import { describe, expect, test } from 'vitest'
import { periodStart, summarizeAccountValue } from '../accountValue'

const points = [
  { date: '2025-01-10', value: 1000, contributions: 1000 },
  { date: '2025-06-30', value: 1100, contributions: 1000 },
  { date: '2026-09-15', value: 1600, contributions: 1500 },
  { date: '2026-10-20', value: 1700, contributions: 1500 },
]

describe('periodStart', () => {
  test('counts months back from today, null for All', () => {
    expect(periodStart('1M', '2026-10-28')).toBe('2026-09-28')
    expect(periodStart('1Y', '2026-10-28')).toBe('2025-10-28')
    expect(periodStart('ALL', '2026-10-28')).toBeNull()
  })
})

describe('summarizeAccountValue', () => {
  test('over everything: paid in is every contribution, the gain the rest', () => {
    const s = summarizeAccountValue(points, 'ALL', '2026-10-28')
    expect(s.value).toBe(1700)
    expect(s.paidIn).toBe(1500)
    expect(s.gain).toBe(200)
    expect(s.startDate).toBe('2025-01-10')
    // Held flat until today.
    expect(s.points[s.points.length - 1]).toMatchObject({ date: '2026-10-28', value: 1700 })
  })

  test('over a period: only what moved inside it, starting from the position before', () => {
    const s = summarizeAccountValue(points, '1Y', '2026-10-28')
    expect(s.points[0]).toMatchObject({ date: '2025-10-28', value: 1100, contributions: 1000 })
    expect(s.paidIn).toBe(500)
    expect(s.gain).toBe(100)
  })

  test('scales to the ownership share', () => {
    const s = summarizeAccountValue(points, 'ALL', '2026-10-28', 50)
    expect(s.value).toBe(850)
    expect(s.paidIn).toBe(750)
    expect(s.gain).toBe(100)
  })

  test('no movement: nothing to draw', () => {
    const s = summarizeAccountValue([], 'ALL', '2026-10-28')
    expect(s.points).toEqual([])
    expect(s.value).toBe(0)
  })
})
