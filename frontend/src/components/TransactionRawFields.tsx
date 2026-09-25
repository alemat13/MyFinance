import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Transaction } from '../api/client'
import { Badge } from './ui/Badge'

/**
 * What the source said about a transaction before anyone renamed it.
 *
 * Purely read-only — none of these fields has an input anywhere, because
 * none of them is editable through the API. Three feeds write them: the
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

export default function TransactionRawFields({ transaction }: { transaction: Transaction }) {
  const [expanded, setExpanded] = useState(false)
  const rows = rawFieldRows(transaction)
  if (rows.length === 0) return null

  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
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
      {expanded && (
        <dl className="mt-1.5 flex flex-col gap-1 py-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2 text-xs">
              <dt className="shrink-0 w-44 text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="text-slate-700 dark:text-slate-200 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
