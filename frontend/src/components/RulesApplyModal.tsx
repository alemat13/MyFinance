import { useEffect, useState } from 'react'
import {
  Rule, RulePreviewResponse, Transaction, User,
  applyRules, fetchRules, previewRules,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { useIsMobile } from '../hooks/useMediaQuery'
import { formatMoney } from '../utils/currency'
import { describeOutcome } from '../utils/rules'
import { Modal, Button, Card, Table, Thead, Tbody, Tr, Th, Td } from './ui'

interface Props {
  transactionIds: number[]
  // The selected rows as the list already has them, for each amount's currency.
  transactions: Transaction[]
  allUsers: User[]
  selectedUserId: number | null
  onClose: () => void
  onApplied: () => void
  onOpenRules?: () => void
}

/** Running the automatic rules on transactions picked on the Transactions screen.
 *
 * Which rules run is a choice here, unlike at a sync or an import: every enabled
 * rule starts ticked, and a disabled one can be ticked to try it on real rows
 * before turning it on. The before/after per row is what gets approved, and rows
 * no rule touches are listed but cannot be ticked.
 */
export default function RulesApplyModal({
  transactionIds, transactions, allUsers, selectedUserId, onClose, onApplied, onOpenRules,
}: Props) {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [ruleIds, setRuleIds] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<RulePreviewResponse | null>(null)
  const [included, setIncluded] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const { showToast } = useToast()
  const isMobile = useIsMobile()

  // Keyed on the ids, not the array the parent rebuilds on every render.
  const idsKey = transactionIds.join(',')

  useEffect(() => {
    fetchRules()
      .then(list => {
        setRules(list)
        setRuleIds(new Set(list.filter(r => r.enabled).map(r => r.id)))
      })
      .catch(err => setError(err.message))
  }, [])

  // Rules in their saved order, so the preview runs them the way a sync would.
  const orderedRuleIds = (rules ?? []).filter(r => ruleIds.has(r.id)).map(r => r.id)
  const ruleKey = orderedRuleIds.join(',')

  useEffect(() => {
    if (rules === null) return
    if (orderedRuleIds.length === 0) { setPreview(null); setIncluded(new Set()); return }
    let cancelled = false
    previewRules(transactionIds, orderedRuleIds)
      .then(res => {
        if (cancelled) return
        setPreview(res)
        setIncluded(new Set(res.items.filter(i => i.outcome).map(i => i.transaction_id)))
      })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [idsKey, ruleKey, rules === null])

  const toggleRule = (id: number) => {
    const next = new Set(ruleIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRuleIds(next)
  }
  const toggleRow = (id: number) => {
    const next = new Set(included)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setIncluded(next)
  }

  const items = preview?.items ?? []
  const toApply = items.filter(i => i.outcome && included.has(i.transaction_id)).map(i => i.transaction_id)
  const currencyOf = (id: number) => transactions.find(t => t.id === id)?.currency ?? 'EUR'

  const apply = () => {
    setApplying(true)
    applyRules(toApply, orderedRuleIds, selectedUserId)
      .then(res => {
        showToast(`${res.updated_count} transaction(s) updated`, 'success')
        onApplied()
      })
      .catch(err => showToast(err.message))
      .finally(() => setApplying(false))
  }

  const changes = (i: (typeof items)[number]) => (i.outcome ? describeOutcome(i.outcome, allUsers) : [])

  return (
    <Modal isOpen size="lg" onClose={onClose} title="Apply rules">
      <div className="flex flex-col gap-3">
        {error && <p className="text-[13px] text-negative">{error}</p>}
        {!error && rules === null && (
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Reading the rules…</p>
        )}

        {rules !== null && rules.length === 0 && (
          <div className="text-[13px]">
            <p className="mb-2">There is no rule yet.</p>
            {onOpenRules && <Button size="sm" onClick={onOpenRules}>Go to Rules</Button>}
          </div>
        )}

        {rules !== null && rules.length > 0 && (
          <>
            <div className="flex gap-x-4 gap-y-1 flex-wrap text-[13px]">
              {rules.map(r => (
                <label key={r.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={ruleIds.has(r.id)} onChange={() => toggleRule(r.id)} />
                  {r.name}
                  {!r.enabled && <span className="text-slate-400">(off)</span>}
                </label>
              ))}
            </div>

            {preview && (
              <p className="text-[13px] text-slate-600 dark:text-slate-300">
                The rules would change {preview.changed_count} of these {items.length} transaction
                {items.length === 1 ? '' : 's'}. A row they change is left unreconciled, unless a rule marks it
                reconciled.
              </p>
            )}

            <div className="max-h-[50vh] overflow-y-auto">
              {isMobile ? (
                <div className="space-y-2">
                  {items.map(i => (
                    <Card key={i.transaction_id} className={`p-3 ${i.outcome ? '' : 'opacity-60'}`}>
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          aria-label={`Include ${i.payee}`}
                          disabled={!i.outcome}
                          checked={included.has(i.transaction_id)}
                          onChange={() => toggleRow(i.transaction_id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2">
                            <span className="font-medium truncate">{i.payee}</span>
                            <span className="shrink-0 font-semibold">{formatMoney(i.amount, currencyOf(i.transaction_id))}</span>
                          </div>
                          <div className="text-[12px] text-slate-500 dark:text-slate-400">
                            {i.date} · {i.current_category_name ?? 'No category'}
                          </div>
                          {i.outcome ? (
                            <div className="mt-1 text-[13px] px-1 rounded bg-amber-50 dark:bg-amber-900/20">
                              {changes(i).map(line => <div key={line}>{line}</div>)}
                              <div className="text-[12px] text-slate-500 dark:text-slate-400">
                                {i.outcome.rule_names.join(', ')}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[12px] text-slate-400">No change</div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th></Th>
                      <Th>Date</Th>
                      <Th>Transaction</Th>
                      <Th className="text-right">Amount</Th>
                      <Th>Now</Th>
                      <Th>Rules would</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {items.map(i => (
                      <Tr key={i.transaction_id} className={i.outcome ? '' : 'opacity-60'}>
                        <Td>
                          <input
                            type="checkbox"
                            aria-label={`Include ${i.payee}`}
                            disabled={!i.outcome}
                            checked={included.has(i.transaction_id)}
                            onChange={() => toggleRow(i.transaction_id)}
                          />
                        </Td>
                        <Td>{i.date}</Td>
                        <Td>{i.payee}</Td>
                        <Td className="text-right">{formatMoney(i.amount, currencyOf(i.transaction_id))}</Td>
                        <Td className="text-slate-500 dark:text-slate-400">{i.current_category_name ?? 'No category'}</Td>
                        <Td className={i.outcome ? 'bg-amber-50 dark:bg-amber-900/20' : ''}>
                          {i.outcome ? (
                            <div className="text-[13px]">
                              {changes(i).map(line => <div key={line}>{line}</div>)}
                              <div className="text-[12px] text-slate-500 dark:text-slate-400">
                                {i.outcome.rule_names.join(', ')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">No change</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
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
