// Admin mode: advanced, destructive features (bulk delete and move, partial
// restore, bank re-sync over a period) only show while the URL carries an
// `admin` parameter (`?admin`, `?admin=1`...), typed by hand. Every in-app
// navigation merges into the existing query string, so it survives moving
// between views; reloading without it turns admin mode off. It hides features,
// it doesn't secure them: the API behind them is reachable either way, and the
// app as a whole sits behind Google IAP.
export function isAdminMode(): boolean {
  return new URLSearchParams(window.location.search).has('admin')
}
