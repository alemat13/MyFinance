interface StatusMessageProps {
  loading?: boolean
  error?: string | null
}

export function StatusMessage({ loading, error }: StatusMessageProps) {
  if (error) {
    return <p className="p-5 text-sm text-negative">Error: {error}</p>
  }
  if (loading) {
    return <p className="p-5 text-sm text-slate-500 dark:text-slate-400">Loading...</p>
  }
  return null
}
