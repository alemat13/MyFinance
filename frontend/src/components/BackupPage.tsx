import { useState } from 'react'
import { BackupImportMode, ImportSummary, exportDatabase, importDatabase } from '../api/client'
import { useToast } from '../context/ToastContext'
import { downloadBlob } from '../utils/download'
import { isAdminMode } from '../utils/admin'
import { Button, Card, Input, Select, ConfirmDialog, BackButton } from './ui'
import OneDriveBackupCard from './OneDriveBackupCard'

interface Props {
  onBack: () => void
}

const CONFIRM_COPY: Record<BackupImportMode, { title: string; message: string }> = {
  overwrite: {
    title: 'Overwrite all data',
    message:
      'This will permanently delete all current data and replace it with the contents of the backup file. ' +
      'This cannot be undone — consider exporting a backup first if you have not already.',
  },
  partial: {
    title: 'Partial restore',
    message:
      'This will add the backup file\'s accounts, categories and transactions next to the existing data, each ' +
      'under a new ID. A category whose name already exists is reused instead of recreated. Nothing existing is ' +
      'changed or removed, and users and bank connections are not restored. ' +
      'Every account, category and user the transactions refer to must exist in the file or in this database, ' +
      'otherwise nothing is restored.',
  },

}

function summaryText(summary: ImportSummary): string {
  if (summary.mode === 'partial') {
    return (
      `Added ${summary.accounts} account(s), ${summary.categories} category(ies), ` +
      `${summary.transactions} transaction(s).`
    )
  }
  return (
    `Imported ${summary.users} user(s), ${summary.accounts} account(s), ${summary.categories} category(ies), ` +
    `${summary.transactions} transaction(s).`
  )
}

export default function BackupPage({ onBack }: Props) {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<BackupImportMode>('overwrite')
  const [confirming, setConfirming] = useState(false)
  const [adminMode] = useState(isAdminMode)
  const { showToast } = useToast()

  const handleExport = () => {
    setExporting(true)
    exportDatabase()
      .then(blob => {
        const filename = `myfinance-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`
        downloadBlob(blob, filename)
      })
      .catch(err => showToast(err.message))
      .finally(() => setExporting(false))
  }

  const runImport = () => {
    if (!file) return
    setConfirming(false)
    setImporting(true)
    importDatabase(file, mode)
      .then(summary => {
        showToast(summaryText(summary), 'success')
        setFile(null)
      })
      .catch(err => showToast(err.message))
      .finally(() => setImporting(false))
  }

  const copy = CONFIRM_COPY[mode]

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Backup &amp; Restore</h2>

      <Card className="p-3 max-w-md mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Export</h3>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-2">
          Download the entire database as a zipped JSON backup file.
        </p>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export Backup'}
        </Button>
      </Card>

      <OneDriveBackupCard />

      {!adminMode && (
        <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-md">
          Restoring a backup is available in admin mode only.
        </p>
      )}

      {adminMode && (
      <Card className="p-3 max-w-md">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Import</h3>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-2">
          Restore data from a previously exported backup file (.zip).
        </p>
        <div className="flex gap-2 flex-wrap items-end mb-2">
          <Input
            type="file"
            accept=".zip"
            aria-label="Backup file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <Select value={mode} onChange={e => setMode(e.target.value as BackupImportMode)} aria-label="Import mode">
            <option value="overwrite">Overwrite all data</option>
            <option value="partial">Partial restore (add accounts, categories, transactions)</option>
          </Select>
        </div>
        <Button
          variant="danger"
          onClick={() => setConfirming(true)}
          disabled={!file || importing}
        >
          {importing ? 'Importing...' : 'Import Backup'}
        </Button>
      </Card>
      )}

      <ConfirmDialog
        isOpen={confirming}
        title={copy.title}
        message={copy.message}
        confirmLabel="Import"
        onConfirm={runImport}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
