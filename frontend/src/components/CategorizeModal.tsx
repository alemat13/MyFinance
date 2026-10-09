import { useEffect, useState } from 'react'
import {
  CategorizerApplyItem, CategorizerSuggestResponse, Transaction,
  applyCategorizerSuggestions, suggestCategories,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatMoney } from '../utils/currency'
import { Modal, Button, Badge, Table, Thead, Tbody, Tr, Th, Td } from './ui'

interface Props {
  transactionIds: number[]
  // The selected rows as the list already has them, for the currency each
  // amount should be shown in: the suggestion itself carries no account.
  transactions: Transaction[]
  selectedUserId: number | null
  onClose: () => void
  onApplied: () => void
  onOpenCategorizer: () => void
}

/** Applying the model to transactions the user picked on the Transactions screen.
 *
 * The before/after is the screen: every row says what it is filed under now and
 * what the model would file it under, so the decision is made on what will
 * actually change rather than on a count. Rows the model would leave exactly as
 * they are stay listed but unticked — seeing that it agrees with you is part of
 * trusting it.
 */
export default function CategorizeModal({
  transactionIds, transactions, selectedUserId, onClose, onApplied, onOpenCategorizer,
}: Props) {
  const [result, setResult] = useState<CategorizerSuggestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [included, setIncluded] = useState<Set<number>>(new Set())
  const [withCategories, setWithCategories] = useState(true)
  const [withRenames, setWithRenames] = useState(true)
  const [overwriteCategory, setOverwriteCategory] = useState(false)
  const [applying, setApplying] = useState(false)
  const { showToast } = useToast()

  // Keyed on the ids themselves, not on the array: the parent builds a fresh
  // array on every render, and depending on that would re-ask the model — and
  // throw away the ticks — each time the page behind the modal re-rendered.
  const idsKey = transactionIds.join(',')

  useEffect(() => {
    let cancelled = false
    suggestCategories(transactionIds)
      .then(res => {
        if (cancelled) return
        setResult(res)
        // Pre-ticked: the rows where the model would change something. A row it
        // agrees with has nothing to apply, so it starts unticked.
        setIncluded(new Set(res.items.filter(i => i.category_changed || i.payee_changed)
          .map(i => i.transaction_id)))
      })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [idsKey])

  const items = result?.items ?? []
  const currencyOf = (id: number) => transactions.find(t => t.id === id)?.currency ?? 'EUR'
  const toggle = (id: number) => {
    const next = new Set(included)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setIncluded(next)
  }

  const payload = (): CategorizerApplyItem[] => items
    .filter(i => included.has(i.transaction_id))
    .map(i => ({
      transaction_id: i.transaction_id,
      ...(withCategories && i.category_changed && i.suggested_category_id !== null
        ? { category_id: i.suggested_category_id } : {}),
      ...(withRenames && i.payee_changed && i.suggested_payee ? { payee: i.suggested_payee } : {}),
    }))
    .filter(i => i.category_id !== undefined || i.payee !== undefined)

  const toApply = payload()

  const apply = () => {
    setApplying(true)
    applyCategorizerSuggestions(toApply, overwriteCategory, selectedUserId)
      .then(res => {
        const skipped = res.skipped_transaction_ids.length
        showToast(
          `${res.updated_count} transaction(s) updated`
          + (skipped ? `, ${skipped} left alone because they already had a category` : ''),
          'success',
        )
        onApplied()
      })
      .catch(err => showToast(err.message))
      .finally(() => setApplying(false))
  }

  return (
    <Modal isOpen size="lg" onClose={onClose} title="Categorize automatically">
      <div className="flex flex-col gap-3">
        {error && (
          <div className="text-[13px]">
            <p className="text-negative mb-2">{error}</p>
            {error.includes('No active model') && (
              <Button size="sm" onClick={onOpenCategorizer}>Go to Auto-categorization</Button>
            )}
          </div>
        )}

        {!error && !result && (
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Reading the model…</p>
        )}

        {result && (
          <>
            <p className="text-[13px] text-slate-600 dark:text-slate-300">
              The model would change the category on {result.category_changes} of these{' '}
              {items.length} transaction{items.length === 1 ? '' : 's'}
              {result.payee_changes > 0 && <> and rename {result.payee_changes}</>}.
              {' '}Everything applied here is left unreconciled, so you can find it again.
            </p>

            <div className="flex gap-4 flex-wrap text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={withCategories}
                       onChange={e => setWithCategories(e.target.checked)} />
                Apply categories
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={withRenames}
                       onChange={e => setWithRenames(e.target.checked)} />
                Apply remembered names ({result.payee_changes})
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={overwriteCategory}
                       onChange={e => setOverwriteCategory(e.target.checked)} />
                Replace categories that are already set
              </label>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th></Th>
                    <Th>Date</Th>
                    <Th>Transaction</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Now</Th>
                    <Th>Suggested</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {items.map(i => {
                    const changes = i.category_changed || i.payee_changed
                    return (
                      <Tr key={i.transaction_id} className={changes ? '' : 'opacity-60'}>
                        <Td>
                          <input
                            type="checkbox"
                            aria-label={`Include ${i.payee}`}
                            checked={included.has(i.transaction_id)}
                            onChange={() => toggle(i.transaction_id)}
                          />
                        </Td>
                        <Td>{i.date}</Td>
                        <Td>
                          <div>{i.payee}</div>
                          {withRenames && i.payee_changed && (
                            <div className="text-[12px] text-amber-700 dark:text-amber-400">
                              → {i.suggested_payee}
                            </div>
                          )}
                        </Td>
                        <Td className="text-right">{formatMoney(i.amount, currencyOf(i.transaction_id))}</Td>
                        <Td className="text-slate-500 dark:text-slate-400">
                          {i.current_category_name ?? 'No category'}
                        </Td>
                        <Td className={i.category_changed ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
                          {i.category_changed ? (
                            <div className="flex items-center gap-2">
                              <span>{i.suggested_category_name}</span>
                              <Badge variant={i.high_confidence ? 'positive' : 'warning'}>
                                {Math.round((i.confidence ?? 0) * 100)}%
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-slate-400">No change</span>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button onClick={apply} disabled={toApply.length === 0 || applying}>
                {applying ? 'Applying…' : `Apply to ${toApply.length} transaction${toApply.length === 1 ? '' : 's'}`}
              </Button>
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
          </>
        )}

        {error && (
          <div>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
