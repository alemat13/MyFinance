import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Matches the `md` breakpoint Tailwind uses elsewhere in the app, so JS-driven
// layout switches (picking one render path, not just hiding one with CSS) stay
// in sync with the `md:` utility classes used for purely cosmetic responsiveness.
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
