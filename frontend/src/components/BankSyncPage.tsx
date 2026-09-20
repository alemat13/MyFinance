import { useEffect, useState } from 'react'
import {
  Account,
  BankAccountLink,
  BankConnection,
  BankInstitution,
  createBankConnection,
  deleteBankConnection,
  fetchAccounts,
  fetchBankConnections,
  fetchBankInstitutions,
  syncBankAccountLink,
  updateBankAccountLink,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatServerTimestamp } from '../utils/datetime'
import { getParam, patchQueryParams } from '../utils/urlState'
import { BackButton, Button, Card, ConfirmDialog, Input, Select, StatusMessage } from './ui'

interface Props {
  onBack: () => void
}

function formatValidUntil(iso: string | null): string | null {
  if (!iso) return null
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(iso)
  return new Date(hasTimezone ? iso : `${iso}Z`).toLocaleDateString()
}

function consentDaysLeft(iso: string | null): number | null {
  if (!iso) return null
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(iso)
  const ms = new Date(hasTimezone ? iso : `${iso}Z`).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

export default function BankSyncPage({ onBack }: Props) {
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [institutions, setInstitutions] = useState<BankInstitution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [institutionsError, setInstitutionsError] = useState<string | null>(null)
  const [selectedInstitution, setSelectedInstitution] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncingLinkId, setSyncingLinkId] = useState<number | null>(null)
  const [savingLinkId, setSavingLinkId] = useState<number | null>(null)
  const [disconnecting, setDisconnecting] = useState<BankConnection | null>(null)
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    Promise.all([fetchBankConnections(), fetchAccounts()])
      .then(([c, a]) => { setConnections(c); setAccounts(a) })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Loaded separately from the rest: the institution list is a live call to
  // Enable Banking, so it fails on its own (no credentials configured yet,
  // provider down) without taking the already-connected banks down with it.
  useEffect(() => {
    fetchBankInstitutions('FR')
      .then(setInstitutions)
      .catch(err => setInstitutionsError(err.message))
  }, [])

  useEffect(() => {
    const status = getParam('bank')
    if (!status) return
    if (status === 'connected') showToast('Bank connected', 'success')
    else showToast('The bank connection was not completed')
    patchQueryParams({ bank: undefined })
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = () => {
    if (!selectedInstitution) { showToast('Pick a bank first'); return }
    setConnecting(true)
    createBankConnection(selectedInstitution)
      .then(result => { window.location.href = result.authorization_url })
      .catch(err => { showToast(err.message); setConnecting(false) })
  }

  const saveLink = (link: BankAccountLink, changes: Partial<BankAccountLink>) => {
    setSavingLinkId(link.id)
    const next = { ...link, ...changes }
    updateBankAccountLink(link.id, {
      account_id: next.account_id,
      sync_enabled: next.sync_enabled,
      sync_from_date: next.sync_from_date,
    })
      .then(() => load())
      .catch(err => showToast(err.message))
      .finally(() => setSavingLinkId(null))
  }

  const syncNow = (link: BankAccountLink) => {
    setSyncingLinkId(link.id)
    syncBankAccountLink(link.id)
      .then(result => {
        if (result.status === 'failed') showToast(result.error ?? 'Sync failed')
        else showToast(`${result.created_count} transaction(s) imported`, 'success')
        load()
      })
      .catch(err => showToast(err.message))
      .finally(() => setSyncingLinkId(null))
  }

  const runDisconnect = () => {
    const connection = disconnecting
    setDisconnecting(null)
    if (!connection) return
    deleteBankConnection(connection.id)
      .then(() => { showToast('Bank disconnected', 'success'); load() })
      .catch(err => showToast(err.message))
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  const openAccounts = accounts.filter(a => !a.archived)

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Bank Sync</h2>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0 mb-4">
        Connect a bank to pull its transactions in automatically. Imported transactions arrive
        uncategorized with the usual default split, so you categorize them exactly as you would a
        manual one. A bank's consent expires after about 90 days — reconnect the bank to renew it.
      </p>

      <StatusMessage loading={loading} />

      {!loading && (
        <Card className="p-3 max-w-xl mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Connect a bank</h3>
          {institutionsError ? (
            <p className="text-[13px] text-negative">
              The bank list is unavailable: {institutionsError}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Select
                value={selectedInstitution}
                onChange={e => setSelectedInstitution(e.target.value)}
                className="flex-1 min-w-[12rem]"
                aria-label="Bank"
              >
                <option value="">Select a bank...</option>
                {institutions.map(i => (
                  <option key={i.name} value={i.name}>{i.name}</option>
                ))}
              </Select>
              <Button onClick={connect} disabled={connecting}>
                {connecting ? 'Redirecting...' : 'Connect'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {!loading && connections.length === 0 && (
        <p className="text-[13px] text-slate-400">No bank connected yet.</p>
      )}

      {!loading && connections.map(connection => {
        const daysLeft = consentDaysLeft(connection.access_valid_until)
        return (
          <Card key={connection.id} className="p-3 max-w-xl mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {connection.aspsp_name}
              </h3>
              <Button variant="danger" onClick={() => setDisconnecting(connection)}>
                Disconnect
              </Button>
            </div>

            {connection.access_valid_until && (
              <p className={`text-[13px] mb-2 ${daysLeft !== null && daysLeft <= 7 ? 'text-negative' : 'text-slate-500 dark:text-slate-400'}`}>
                Access valid until {formatValidUntil(connection.access_valid_until)}
                {daysLeft !== null && daysLeft <= 7 && ' — reconnect this bank to keep syncing'}
              </p>
            )}
            {connection.last_error && (
              <p className="text-[13px] text-negative mb-2">{connection.last_error}</p>
            )}

            {connection.accounts.length === 0 && (
              <p className="text-[13px] text-slate-400">This consent exposed no account.</p>
            )}

            {connection.accounts.map(link => (
              <div key={link.id} className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                <p className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">
                  {link.remote_name ?? 'Account'} {link.currency && <span className="font-normal text-slate-400">({link.currency})</span>}
                </p>
                {link.iban && <p className="text-[13px] text-slate-400 mb-2">{link.iban}</p>}

                <div className="flex flex-wrap gap-2 items-end mb-2">
                  <div className="flex-1 min-w-[10rem]">
                    <label className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1" htmlFor={`link-account-${link.id}`}>
                      Feeds MyFinance account
                    </label>
                    <Select
                      id={`link-account-${link.id}`}
                      value={link.account_id ?? ''}
                      onChange={e => saveLink(link, { account_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="w-full"
                      disabled={savingLinkId === link.id}
                    >
                      <option value="">Not linked</option>
                      {openAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1" htmlFor={`link-from-${link.id}`}>
                      Import from
                    </label>
                    <Input
                      id={`link-from-${link.id}`}
                      type="date"
                      value={link.sync_from_date ?? ''}
                      onChange={e => saveLink(link, { sync_from_date: e.target.value || null })}
                      disabled={savingLinkId === link.id || link.account_id === null}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant="secondary"
                    onClick={() => syncNow(link)}
                    disabled={link.account_id === null || syncingLinkId === link.id}
                  >
                    {syncingLinkId === link.id ? 'Syncing...' : 'Sync now'}
                  </Button>
                  <label className="text-[13px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={link.sync_enabled}
                      onChange={e => saveLink(link, { sync_enabled: e.target.checked })}
                      disabled={link.account_id === null}
                    />
                    Sync automatically
                  </label>
                </div>

                {link.last_synced_at && (
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-2">
                    Last sync: {formatServerTimestamp(link.last_synced_at)} —{' '}
                    <span className={link.last_sync_status === 'failed' ? 'text-negative' : 'text-green-600 dark:text-green-400'}>
                      {link.last_sync_status}
                    </span>
                    {link.last_sync_status === 'success' && ` (${link.last_imported_count} imported)`}
                    {link.last_sync_status === 'failed' && link.last_sync_error && (
                      <span className="block text-negative">{link.last_sync_error}</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </Card>
        )
      })}

      <ConfirmDialog
        isOpen={disconnecting !== null}
        title="Disconnect bank"
        message="This revokes the consent at the bank and stops future syncs. Transactions already imported are kept."
        confirmLabel="Disconnect"
        onConfirm={runDisconnect}
        onCancel={() => setDisconnecting(null)}
      />
    </div>
  )
}
