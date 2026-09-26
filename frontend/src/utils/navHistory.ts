// Lets the browser/Android back button close an open dialog instead of leaving the
// app. Each open Modal/Sheet pushes a history entry (same URL) whose state lists the
// ids of the dialogs open at that point; going back pops that entry and closes
// whichever dialog is no longer listed. Closing a dialog any other way (its X,
// Escape, a Save button) goes back over its own entry, so the history stays in step
// with what's on screen.

function currentOverlays(): string[] {
  const overlays = window.history.state?.overlays
  return Array.isArray(overlays) ? overlays : []
}

export function isOverlayOpen(id: string): boolean {
  return currentOverlays().includes(id)
}

const pendingReleases = new Set<string>()

export function pushOverlay(id: string) {
  // A release still queued for this id (React StrictMode re-running the effect)
  // is simply cancelled: the entry is still there.
  if (pendingReleases.delete(id) && isOverlayOpen(id)) return
  window.history.pushState(
    { ...(window.history.state ?? {}), overlays: [...currentOverlays(), id] },
    '',
    window.location.href,
  )
}

// Called when a dialog closes. Batched in a microtask so that closing a dialog and its
// parent in the same render (e.g. after dividing a transaction) goes back once, over
// both entries.
export function releaseOverlay(id: string) {
  pendingReleases.add(id)
  if (pendingReleases.size === 1) queueMicrotask(flushReleases)
}

function flushReleases() {
  const stack = currentOverlays()
  let lowest = stack.length
  pendingReleases.forEach(id => {
    const i = stack.indexOf(id)
    if (i >= 0 && i < lowest) lowest = i
  })
  pendingReleases.clear()
  const steps = stack.length - lowest
  if (steps === 0) return
  // Query params changed while the dialog was open (closing the transaction detail
  // drops ?transaction=) would be lost by going back to the older entry: carry them
  // over once it's current.
  const url = window.location.href
  window.addEventListener('popstate', () => {
    if (window.location.href !== url) window.history.replaceState(window.history.state, '', url)
  }, { once: true })
  window.history.go(-steps)
}
