import { useEffect, useState } from 'react'
import {
  AlertFrequency,
  EmailAlert,
  User,
  fetchEmailAlert,
  fetchUsers,
  sendTestEmailAlert,
  updateEmailAlert,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatServerTimestamp } from '../utils/datetime'
import { BackButton, Button, Card, Input, StatusMessage } from './ui'

interface Props {
  onBack: () => void
  selectedUserId: number | null
}

const FREQUENCIES: { key: AlertFrequency; label: string; hint: string }[] = [
  { key: 'daily', label: 'Daily', hint: 'After the morning bank sync, and after each Sync now' },
  { key: 'weekly', label: 'Weekly', hint: 'Sunday evening, what arrived during the week' },
  { key: 'monthly', label: 'Monthly', hint: 'On the last day of the month, in the evening' },
]

function AlertCard({ user, initial }: { user: User; initial: EmailAlert }) {
  const [alert, setAlert] = useState(initial)
  const [email, setEmail] = useState(initial.email ?? '')
  const [enabled, setEnabled] = useState<Record<AlertFrequency, boolean>>({
    daily: initial.daily, weekly: initial.weekly, monthly: initial.monthly,
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const { showToast } = useToast()

  const dirty = email.trim() !== (alert.email ?? '')
    || FREQUENCIES.some(({ key }) => enabled[key] !== alert[key])

  const save = () => {
    setSaving(true)
    updateEmailAlert(user.id, { email: email.trim() || null, ...enabled })
      .then(saved => {
        setAlert(saved)
        setEmail(saved.email ?? '')
        showToast('Alert settings saved', 'success')
      })
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  const sendTest = () => {
    setTesting(true)
    sendTestEmailAlert(user.id)
      .then(result => showToast(
        `Test email sent to ${result.sent_to} (${result.transaction_count} transaction${result.transaction_count === 1 ? '' : 's'} from the last 7 days)`,
        'success',
      ))
      .catch(err => showToast(err.message))
      .finally(() => setTesting(false))
  }

  const lastSent = FREQUENCIES
    .filter(({ key }) => alert[key] && alert[`last_${key}_sent_at`])
    .map(({ key, label }) => ({ label, at: alert[`last_${key}_sent_at`] as string }))

  return (
    <Card className="p-3 max-w-md mb-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{user.name}</h3>

      <label htmlFor={`alert-email-${user.id}`} className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1">
        Send to
      </label>
      <Input
        id={`alert-email-${user.id}`}
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="name@example.com"
        className="w-full mb-3"
      />

      <fieldset className="mb-3">
        <legend className="text-[13px] text-slate-500 dark:text-slate-400 mb-1">New transactions</legend>
        {FREQUENCIES.map(({ key, label, hint }) => (
          <label key={key} className="flex items-start gap-2 py-1 text-[13px] text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={enabled[key]}
              onChange={e => setEnabled(s => ({ ...s, [key]: e.target.checked }))}
            />
            <span>
              <span className="font-medium">{label}</span>
              <span className="block text-[12px] text-slate-500 dark:text-slate-400">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-2 mb-2">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="secondary"
          onClick={sendTest}
          disabled={testing || dirty || !alert.email || !alert.sending_configured}
          title={dirty ? 'Save first' : undefined}
        >
          {testing ? 'Sending...' : 'Send a test email'}
        </Button>
      </div>

      {lastSent.length > 0 && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          {lastSent.map(({ label, at }) => (
            <span key={label} className="block">{label}: counting since {formatServerTimestamp(at)}</span>
          ))}
        </p>
      )}
      {alert.last_status === 'failed' && alert.last_error && (
        <p className="text-[12px] text-red-500 mt-1">Last send failed: {alert.last_error}</p>
      )}
    </Card>
  )
}

export default function EmailAlertsPage({ onBack, selectedUserId }: Props) {
  const [entries, setEntries] = useState<{ user: User; alert: EmailAlert }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchUsers()
      .then(users => {
        const shown = selectedUserId ? users.filter(u => u.id === selectedUserId) : users
        return Promise.all(shown.map(user => fetchEmailAlert(user.id).then(alert => ({ user, alert }))))
      })
      .then(setEntries)
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }, [selectedUserId])

  if (error) {
    return <StatusMessage error={error} />
  }

  const first = entries[0]?.alert

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Email alerts</h2>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0 mb-4">
        Get an email listing the transactions that arrived in MyFinance (bank sync, import or typed in)
        on your own accounts. Pick any combination of frequencies; nothing is sent when nothing is new.
        {first?.from_address && <> Emails come from <span className="font-medium">{first.from_address}</span>.</>}
      </p>

      <StatusMessage loading={loading} />

      {!loading && first && !first.sending_configured && (
        <div role="note" className="max-w-md mb-4 p-2.5 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-[13px] dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          Email sending isn't set up on the server yet, so alerts can be saved but won't go out.
        </div>
      )}

      {!loading && entries.map(({ user, alert }) => (
        <AlertCard key={user.id} user={user} initial={alert} />
      ))}
    </div>
  )
}
