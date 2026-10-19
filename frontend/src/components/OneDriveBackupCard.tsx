import { useEffect, useState } from 'react'
import {
  OneDriveSettings,
  disconnectOneDrive,
  fetchOneDriveSettings,
  getOneDriveConnectUrl,
  runOneDriveBackupNow,
  updateOneDriveSettings,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatServerTimestamp } from '../utils/datetime'
import { getParam, patchQueryParams } from '../utils/urlState'
import { Button, Card, ConfirmDialog, Input, StatusMessage, NumberInput } from './ui'

type Retention = Pick<OneDriveSettings, 'keep_daily' | 'keep_weekly' | 'keep_monthly' | 'keep_yearly'>

const RETENTION_FIELDS: { key: keyof Retention; label: string }[] = [
  { key: 'keep_daily', label: 'Daily' },
  { key: 'keep_weekly', label: 'Weekly' },
  { key: 'keep_monthly', label: 'Monthly' },
  { key: 'keep_yearly', label: 'Yearly' },
]

export default function OneDriveBackupCard() {
  const [settings, setSettings] = useState<OneDriveSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [runningNow, setRunningNow] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [folderPath, setFolderPath] = useState('')
  const [retention, setRetention] = useState<Retention>({ keep_daily: 8, keep_weekly: 5, keep_monthly: 13, keep_yearly: 10 })
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    fetchOneDriveSettings()
      .then(s => {
        setSettings(s)
        setFolderPath(s.folder_path ?? '')
        setRetention({ keep_daily: s.keep_daily, keep_weekly: s.keep_weekly, keep_monthly: s.keep_monthly, keep_yearly: s.keep_yearly })
      })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  useEffect(() => {
    const status = getParam('onedrive')
    if (!status) return
    if (status === 'connected') showToast('OneDrive connected', 'success')
    else if (status === 'error') showToast('Failed to connect to OneDrive')
    patchQueryParams({ onedrive: undefined })
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = () => {
    if (!folderPath.trim()) { showToast('Folder path cannot be empty'); return }
    const counts = Object.values(retention)
    if (counts.some(n => n < 0 || n > 365)) { showToast('Each retention count must be between 0 and 365'); return }
    if (counts.every(n => n === 0)) { showToast('At least one retention count must be above 0'); return }
    setSaving(true)
    updateOneDriveSettings({ folder_path: folderPath.trim(), ...retention })
      .then(setSettings)
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  const runNow = () => {
    setRunningNow(true)
    runOneDriveBackupNow()
      .then(result => {
        if (result.status === 'success') showToast('Backup uploaded to OneDrive', 'success')
        else showToast(result.error ?? 'Backup failed')
        load()
      })
      .catch(err => showToast(err.message))
      .finally(() => setRunningNow(false))
  }

  const runDisconnect = () => {
    setConfirmingDisconnect(false)
    setDisconnecting(true)
    disconnectOneDrive()
      .then(setSettings)
      .catch(err => showToast(err.message))
      .finally(() => setDisconnecting(false))
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <Card className="p-3 max-w-md mb-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">OneDrive Automatic Backup</h3>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-2">
        Connect a OneDrive account to automatically upload a backup to a chosen folder once a
        day. Restoring a backup is still done manually via Import above.
      </p>

      <StatusMessage loading={loading} />

      {!loading && settings && !settings.connected && (
        <Button onClick={() => { window.location.href = getOneDriveConnectUrl() }}>
          Connect OneDrive
        </Button>
      )}

      {!loading && settings && settings.connected && (
        <div>
          <p className="text-[13px] text-slate-700 dark:text-slate-200 mb-2">
            Connected as <span className="font-medium">{settings.account_email}</span>
          </p>

          <label className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1">Folder path</label>
          <Input
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="/MyFinance Backups"
            className="w-full mb-2"
          />

          <fieldset className="mb-2">
            <legend className="text-[13px] text-slate-500 dark:text-slate-400 mb-1">Backups to keep</legend>
            <div className="grid grid-cols-4 gap-2">
              {RETENTION_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label htmlFor={`onedrive-${key}`} className="block text-[12px] text-slate-500 dark:text-slate-400 mb-0.5">{label}</label>
                  <NumberInput
                    id={`onedrive-${key}`}
                    integer
                    value={retention[key]}
                    onValueChange={v => setRetention(r => ({ ...r, [key]: Math.min(v ?? 0, 365) }))}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
              Keeps the newest backup of each of the last N days, weeks, months and years. A
              backup can count for several of them. Other files in the folder are never touched.
            </p>
          </fieldset>

          <div className="flex flex-wrap gap-2 mb-2">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={runNow} disabled={runningNow}>
              {runningNow ? 'Backing up...' : 'Backup Now'}
            </Button>
            <Button variant="danger" onClick={() => setConfirmingDisconnect(true)} disabled={disconnecting}>
              Disconnect
            </Button>
          </div>

          {settings.last_backup_at && (
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Last backup: {formatServerTimestamp(settings.last_backup_at)} —{' '}
              <span className={settings.last_backup_status === 'failed' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}>
                {settings.last_backup_status}
              </span>
              {settings.last_backup_status === 'failed' && settings.last_backup_error && (
                <span className="block text-red-500">{settings.last_backup_error}</span>
              )}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmingDisconnect}
        title="Disconnect OneDrive"
        message="This stops automatic backups and removes the stored connection. Previously uploaded backup files on OneDrive are not deleted."
        confirmLabel="Disconnect"
        onConfirm={runDisconnect}
        onCancel={() => setConfirmingDisconnect(false)}
      />
    </Card>
  )
}
