export function getParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

// Merges `updates` into the current query string; a value of undefined/'' deletes that key.
// Leaves every other existing key (owned by other components) untouched.
export function patchQueryParams(updates: Record<string, string | undefined>) {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === '') params.delete(key)
    else params.set(key, value)
  }
  const qs = params.toString()
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`
  window.history.replaceState(null, '', url)
}
