import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { updateTransactionRawFields, type Transaction, type TransactionRawFields as RawFields } from '../api/client'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Input, Select } from './ui/Input'
import { useToast } from '../context/ToastContext'

/**
 * What the source said about a transaction before anyone renamed it.
 *
 * Read-only, except in admin mode, which adds an Edit button backed by
 * PUT /api/transactions/{id}/raw (the only way to rewrite them). Three feeds write them: the
 * bank sync for newly imported rows, CSV import (the file's label only), and
 * the Linxo export backfill for migrated history. Collapsed by default: for the transactions that have it, this is
 * reference material you go looking for, not something you read on every
 * open.
 */

const SOURCE_LABELS: Record<string, string> = {
  enable_banking: 'Bank sync',
  csv_import: 'CSV import',
  linxo_export: 'Linxo export',
}

export function rawFieldRows(transaction: Transaction): [string, string][] {
  // raw_transaction_code is an ISO 20022 code from a bank and a Linxo
  // transaction type from the export, so it can't carry one fixed caption.
  const codeLabel = transaction.raw_source === 'enable_banking' ? 'Bank transaction code' : 'Transaction type'
  const candidates: [string, string | null | undefined][] = [
    ['Original label', transaction.raw_label],
    ['Counterparty', transaction.raw_counterparty],
    [codeLabel, transaction.raw_transaction_code],
    ['Merchant category code', transaction.raw_merchant_category_code],
    ['Merchant location', transaction.raw_merchant_location],
    ['Purchase date', transaction.raw_initiated_date],
    ['Booking date', transaction.raw_booking_date],
  ]
  return candidates.filter((row): row is [string, string] => {
    const value = row[1]
    return typeof value === 'string' && value.trim() !== ''
  })
}

type TextField = 'raw_label' | 'raw_counterparty' | 'raw_transaction_code' | 'raw_merchant_category_code' | 'raw_merchant_location'
type DateField = 'raw_initiated_date' | 'raw_booking_date'

// Every editable field, with its caption and the column's length limit.
const EDIT_FIELDS: { key: TextField | DateField; label: string; type: 'text' | 'date'; maxLength?: number }[] = [
  { key: 'raw_label', label: 'Original label', type: 'text' },
  { key: 'raw_counterparty', label: 'Counterparty', type: 'text', maxLength: 200 },
  { key: 'raw_transaction_code', label: 'Bank transaction code / type', type: 'text', maxLength: 60 },
  { key: 'raw_merchant_category_code', label: 'Merchant category code', type: 'text', maxLength: 10 },
  { key: 'raw_merchant_location', label: 'Merchant location', type: 'text', maxLength: 120 },
  { key: 'raw_initiated_date', label: 'Purchase date', type: 'date' },
  { key: 'raw_booking_date', label: 'Booking date', type: 'date' },
]

const toDraft = (t: Transaction): Required<{ [K in keyof RawFields]: string }> => ({
  raw_source: t.raw_source ?? '',
  raw_label: t.raw_label ?? '',
  raw_counterparty: t.raw_counterparty ?? '',
  raw_transaction_code: t.raw_transaction_code ?? '',
  raw_merchant_category_code: t.raw_merchant_category_code ?? '',
  raw_merchant_location: t.raw_merchant_location ?? '',
  raw_initiated_date: t.raw_initiated_date ?? '',
  raw_booking_date: t.raw_booking_date ?? '',
})

interface Props {
  transaction: Transaction
  /** Admin mode: show the section even when empty, with an Edit button. */
  adminMode?: boolean
  actorUserId?: number | null
  /** Called with the saved transaction once an admin edit lands. */
  onSaved?: (transaction: Transaction) => void
}

export default function TransactionRawFields({ transaction, adminMode = false, actorUserId, onSaved }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState<ReturnType<typeof toDraft> | null>(null)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const rows = rawFieldRows(transaction)
  if (rows.length === 0 && !adminMode) return null

  const startEditing = () => {
    setDraft(toDraft(transaction))
    setExpanded(true)
  }

  const save = () => {
    if (!draft) return
    // Only what changed is sent, so a field nobody touched is never rewritten.
    const original = toDraft(transaction)
    const changes: Record<string, string | null> = {}
    for (const key of Object.keys(draft) as (keyof typeof draft)[]) {
      if (draft[key].trim() !== original[key].trim()) changes[key] = draft[key].trim() || null
    }
    if (Object.keys(changes).length === 0) {
      setDraft(null)
      return
    }
    setSaving(true)
    updateTransactionRawFields(transaction.id, changes as RawFields, actorUserId)
      .then(saved => {
        setDraft(null)
        onSaved?.(saved)
      })
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          <Chevron size={14} aria-hidden="true" />
          As reported by the bank
          {transaction.raw_source && (
            <Badge variant="neutral">{SOURCE_LABELS[transaction.raw_source] ?? transaction.raw_source}</Badge>
          )}
        </button>
        {adminMode && !draft && (
          <Button type="button" variant="secondary" size="sm" onClick={startEditing}>Edit bank fields</Button>
        )}
      </div>
      {expanded && draft && (
        <div className="mt-1.5 flex flex-col gap-2 py-1 rounded border border-red-300 dark:border-red-800 p-2">
          <p className="text-xs text-red-700 dark:text-red-300">
            Admin mode: these fields are what the source reported. Changing them doesn't touch the amount, date, payee or balances.
          </p>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400">
            Source
            <Select
              value={draft.raw_source}
              onChange={e => setDraft({ ...draft, raw_source: e.target.value })}
            >
              <option value="">None</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </label>
          {EDIT_FIELDS.map(field => (
            <label key={field.key} className="flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400">
              {field.label}
              <Input
                type={field.type}
                value={draft[field.key]}
                maxLength={field.maxLength}
                onChange={e => setDraft({ ...draft, [field.key]: e.target.value })}
              />
            </label>
          ))}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>Save bank fields</Button>
          </div>
        </div>
      )}
      {expanded && !draft && (
        rows.length === 0
          ? <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Nothing reported.</p>
          : (
            <dl className="mt-1.5 flex flex-col gap-1 py-1">
              {rows.map(([label, value]) => (
                <div key={label} className="flex gap-2 text-xs">
                  <dt className="shrink-0 w-44 text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="text-slate-700 dark:text-slate-200 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )
      )}
    </div>
  )
}
