export function getParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function buildUrl(updates: Record<string, string | undefined>): string {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === '') params.delete(key)
    else params.set(key, value)
  }
  const qs = params.toString()
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`
}

// Merges `updates` into the current query string; a value of undefined/'' deletes that key.
// Leaves every other existing key (owned by other components) untouched. Rewrites the
// current history entry in place (filters, pagination...) and keeps its state, which
// carries the open-dialog markers from utils/navHistory.ts.
export function patchQueryParams(updates: Record<string, string | undefined>) {
  window.history.replaceState(window.history.state, '', buildUrl(updates))
}

// Same merge as patchQueryParams, but as a navigation: adds a history entry, so the
// browser/Android back button returns to where the user was. When a dialog's entry is
// current (e.g. navigating from the "More" sheet), that entry is reused instead, so
// back doesn't land on a dialog that is no longer open.
export function navigateQueryParams(updates: Record<string, string | undefined>) {
  const url = buildUrl(updates)
  const state = window.history.state
  if (Array.isArray(state?.overlays) && state.overlays.length > 0) {
    window.history.replaceState({ ...state, overlays: [] }, '', url)
  } else {
    window.history.pushState(state, '', url)
  }
}
