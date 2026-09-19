// Backend timestamps (e.g. OneDriveBackupSettings.last_backup_at,
// TransactionHistory.changed_at) are stored as naive UTC datetimes and
// serialize without a timezone designator — a bare `new Date(...)` would
// misparse them as local time. Treat a designator-less ISO string as UTC.
export function formatServerTimestamp(iso: string): string {
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(iso)
  return new Date(hasTimezone ? iso : `${iso}Z`).toLocaleString()
}
