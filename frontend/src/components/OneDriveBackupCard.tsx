import { useEffect, useState } from 'react'
import {
  OneDriveFrequency,
  OneDriveSettings,
  disconnectOneDrive,
  fetchOneDriveSettings,
  getOneDriveConnectUrl,
  runOneDriveBackupNow,
  updateOneDriveSettings,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { getParam, patchQueryParams } from '../utils/urlState'
import { Button, Card, ConfirmDialog, Input, Select, StatusMessage } from './ui'

export default function OneDriveBackupCard() {
  const [settings, setSettings] = useState<OneDriveSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [runningNow, setRunningNow] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)
  const [folderPath, setFolderPath] = useState('')
  const [frequency, setFrequency] = useState<OneDriveFrequency>('daily')
  const [retentionCount, setRetentionCount] = useState(30)
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    fetchOneDriveSettings()
      .then(s => {
        setSettings(s)
        setFolderPath(s.folder_path ?? '')
        setFrequency(s.frequency)
        setRetentionCount(s.retention_count)
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
    if (retentionCount < 1 || retentionCount > 365) { showToast('Retention count must be between 1 and 365'); return }
    setSaving(true)
    updateOneDriveSettings({ folder_path: folderPath.trim(), frequency, retention_count: retentionCount })
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
        Connect a OneDrive account to automatically upload a backup to a chosen folder on a
        schedule. Restoring a backup is still done manually via Import above.
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

          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1">Frequency</label>
              <Select
                value={frequency}
                onChange={e => setFrequency(e.target.value as OneDriveFrequency)}
                className="w-full"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </div>
            <div className="flex-1">
              <label className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1">Keep last</label>
              <Input
                type="number"
                min="1"
                max="365"
                value={retentionCount}
                onChange={e => setRetentionCount(parseInt(e.target.value, 10) || 0)}
                className="w-full"
              />
            </div>
          </div>

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
              Last backup: {new Date(settings.last_backup_at).toLocaleString()} —{' '}
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
