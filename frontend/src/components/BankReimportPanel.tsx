import { useState } from 'react'
import { BankAccountLink, BankReimportResult, reimportBankPeriod } from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../utils/currency'
import { Button, Input } from './ui'

interface Props {
  link: BankAccountLink
  onDone: () => void
}

/** Asks the bank for a past period again and adds only what the ledger is
 * missing. Always previews first: nothing is written until "Add" is pressed,
 * and the rows added are exactly the ones listed. */
export default function BankReimportPanel({ link, onDone }: Props) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [preview, setPreview] = useState<BankReimportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const currency = link.currency ?? 'EUR'

  const run = (apply: boolean) => {
    if (!dateFrom || !dateTo) { showToast('Pick both dates'); return }
    setBusy(true)
    reimportBankPeriod(link.id, dateFrom, dateTo, apply)
      .then(result => {
        if (apply) {
          showToast(`${result.count} transaction(s) added`, 'success')
          setPreview(null)
          onDone()
        } else {
          setPreview(result)
        }
      })
      .catch(err => showToast(err.message))
      .finally(() => setBusy(false))
  }

  return (
    <div className="mt-2 p-3 rounded-md border border-slate-200 dark:border-slate-700">
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-2">
        Ask the bank for a past period again and add only the transactions missing from MyFinance.
        Nothing already here is changed.
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1" htmlFor={`reimport-from-${link.id}`}>From</label>
          <Input id={`reimport-from-${link.id}`} type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPreview(null) }} />
        </div>
        <div>
          <label className="block text-[13px] text-slate-500 dark:text-slate-400 mb-1" htmlFor={`reimport-to-${link.id}`}>To</label>
          <Input id={`reimport-to-${link.id}`} type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPreview(null) }} />
        </div>
        <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
          {busy && !preview ? 'Asking the bank...' : 'Preview'}
        </Button>
      </div>

      {preview && (
        <div className="mt-3">
          <p className="text-[13px] font-medium mb-1">
            {preview.count === 0
              ? 'Nothing is missing for this period.'
              : `${preview.count} missing transaction(s), total ${formatMoney(preview.total, currency)}`}
          </p>
          {preview.count > 0 && (
            <>
              <div className="max-h-64 overflow-y-auto text-[13px] border-t border-slate-200 dark:border-slate-700">
                {preview.rows.map((r, i) => (
                  <div key={i} className="flex gap-2 py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="w-24 shrink-0 text-slate-500">{r.date}</span>
                    <span className="flex-1 truncate">{r.payee}</span>
                    <span className={r.amount < 0 ? 'text-negative' : ''}>{formatMoney(r.amount, currency)}</span>
                  </div>
                ))}
              </div>
              <Button className="mt-2" onClick={() => run(true)} disabled={busy}>
                {busy ? 'Adding...' : `Add these ${preview.count} transaction(s)`}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
