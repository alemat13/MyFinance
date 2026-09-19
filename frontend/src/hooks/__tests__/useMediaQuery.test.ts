import { describe, test, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '../useMediaQuery'

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  let listener: (() => void) | null = null
  const mql = {
    get matches() { return matches },
    media: '',
    addEventListener: (_: string, cb: () => void) => { listener = cb },
    removeEventListener: () => { listener = null },
  }
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia
  return {
    setMatches: (next: boolean) => { matches = next; listener?.() },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('reflects the current match state', () => {
  mockMatchMedia(true)
  const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
  expect(result.current).toBe(true)
})

test('updates when the media query match changes', () => {
  const { setMatches } = mockMatchMedia(false)
  const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
  expect(result.current).toBe(false)

  act(() => setMatches(true))
  expect(result.current).toBe(true)
})
