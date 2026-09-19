import { describe, test, expect } from 'vitest'
import { formatServerTimestamp } from '../datetime'

describe('formatServerTimestamp', () => {
  test('treats a naive (timezone-less) ISO string as UTC', () => {
    expect(formatServerTimestamp('2026-09-19T12:26:00')).toBe(new Date('2026-09-19T12:26:00Z').toLocaleString())
  })

  test('leaves an already timezone-aware string untouched', () => {
    expect(formatServerTimestamp('2026-09-19T12:26:00Z')).toBe(new Date('2026-09-19T12:26:00Z').toLocaleString())
    expect(formatServerTimestamp('2026-09-19T12:26:00+02:00')).toBe(new Date('2026-09-19T12:26:00+02:00').toLocaleString())
  })
})
