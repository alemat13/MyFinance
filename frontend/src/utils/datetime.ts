// Backend timestamps (e.g. OneDriveBackupSettings.last_backup_at,
// TransactionHistory.changed_at) are stored as naive UTC datetimes and
// serialize without a timezone designator — a bare `new Date(...)` would
// misparse them as local time. Treat a designator-less ISO string as UTC.
function parseServerTimestamp(iso: string): Date {
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(iso)
  return new Date(hasTimezone ? iso : `${iso}Z`)
}

export function formatServerTimestamp(iso: string): string {
  return parseServerTimestamp(iso).toLocaleString()
}

// The local day of a server timestamp, for grouping a timeline by day.
export function formatServerDay(iso: string): string {
  return parseServerTimestamp(iso).toLocaleDateString()
}
