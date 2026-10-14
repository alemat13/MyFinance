import { useState } from 'react'
import {
  Transaction, BulkTransactionUpdate, GlobalSplitWeight, PayeeMode,
  Account, Category, User, TransactionSearchRequest,
  bulkUpdateTransactions, bulkUpdateTransactionsByFilter,
} from '../api/client'
import { SplitRow } from './SplitEditor'
import TransactionSplitFields from './TransactionSplitFields'
import CategoryPicker from './CategoryPicker'
import AccountPicker from './AccountPicker'
import { useToast } from '../context/ToastContext'
import { Modal, Button, Select, Input } from './ui'

interface Props {
  transactionIds: number[]
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  allUsers: User[]
  globalWeights: GlobalSplitWeight[]
  selectedUserId: number | null
  onClose: () => void
  onSaved: () => void
  /** The Transactions screen's current filter and how many rows it matches
   * across every page. When the match count is larger than the selection,
   * the modal offers to extend the edit to all of them. */
  searchFilter?: TransactionSearchRequest
  matchingTotal?: number
  /** Admin mode only: the accounts a selection can be moved to. When absent
   * the "Move to another account" section isn't offered. */
  moveAccounts?: Account[]
}

const PAYEE_MODES: { value: PayeeMode; label: string; placeholder: string }[] = [
  { value: 'replace', label: 'Replace', placeholder: 'New payee' },
  { value: 'prepend', label: 'Prepend', placeholder: 'Text to add before' },
  { value: 'append', label: 'Append', placeholder: 'Text to add after' },
]

/** The payee a row would get. Prepend/append keep the text as typed, so a
 * separating space is the user's to include; Replace trims it like the API. */
function renamedPayee(current: string, text: string, mode: PayeeMode): string {
  if (mode === 'prepend') return text + current
  if (mode === 'append') return current + text
  return text.trim()
}

const ACCOUNTING_MONTH_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

function offsetLabel(offset: number): string {
  if (offset === 0) return 'No shift'
  const n = Math.abs(offset)
  return `${offset > 0 ? '+' : '-'}${n} month${n === 1 ? '' : 's'}`
}

export default function BulkEditModal({
  transactionIds, transactions, accounts, categories, allUsers, globalWeights, selectedUserId, onClose, onSaved,
  searchFilter, matchingTotal, moveAccounts,
}: Props) {
  const canSelectAllMatching = searchFilter != null && matchingTotal != null && matchingTotal > transactionIds.length
  const [allMatching, setAllMatching] = useState(false)
  const targetCount = allMatching && matchingTotal != null ? matchingTotal : transactionIds.length

  const [categoryEnabled, setCategoryEnabled] = useState(false)
  const [categoryId, setCategoryId] = useState<number | null>(null)

  const [renameEnabled, setRenameEnabled] = useState(false)
  const [payee, setPayee] = useState('')
  const [payeeMode, setPayeeMode] = useState<PayeeMode>('replace')

  const [moveEnabled, setMoveEnabled] = useState(false)
  const [moveAccountId, setMoveAccountId] = useState<number | null>(null)

  const [offsetEnabled, setOffsetEnabled] = useState(false)
  const [offset, setOffset] = useState(0)

  const [splitEnabled, setSplitEnabled] = useState(false)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([])
  const [splitSource, setSplitSource] = useState<'global' | 'account' | 'category' | 'custom' | null>(null)

  const [reconciledEnabled, setReconciledEnabled] = useState(false)
  const [reconciledValue, setReconciledValue] = useState(true)

  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const currencies = [...new Set(transactions.map(t => t.currency))]
  const previewTransaction = transactions[0]

  const canSave = (categoryEnabled || renameEnabled || moveEnabled || offsetEnabled || splitEnabled || reconciledEnabled)
    && !(moveEnabled && moveAccountId == null)
    && !(renameEnabled && payee.trim() === '')

  const handleSave = () => {
    if (splitEnabled && splitRows.length === 0) {
      showToast('Add at least one person to the split'); return
    }
    const update: BulkTransactionUpdate = {
      ...(categoryEnabled ? { category_id: categoryId } : {}),
      ...(renameEnabled
        ? payeeMode === 'replace' ? { payee: payee.trim() } : { payee, payee_mode: payeeMode }
        : {}),
      ...(moveEnabled && moveAccountId != null ? { account_id: moveAccountId } : {}),
      ...(offsetEnabled ? { accounting_month_offset: offset } : {}),
      ...(splitEnabled ? {
        split_weights: splitRows.map(r => ({ user_id: r.user_id, weight: r.value })),
        split_source: (splitSource ?? 'custom') as 'custom',
      } : {}),
      ...(reconciledEnabled ? { reconciled: reconciledValue } : {}),
    }
    setSaving(true)
    const call = allMatching && searchFilter && matchingTotal != null
      ? bulkUpdateTransactionsByFilter(searchFilter, matchingTotal, update, selectedUserId)
      : bulkUpdateTransactions(transactionIds, update, selectedUserId)
    call
      .then(res => {
        showToast(`${res.updated_count} transaction(s) updated`, 'success')
        onSaved()
      })
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  return (
    <Modal isOpen size="lg" onClose={onClose} title="Bulk Edit Transactions">
      <div className="flex flex-col gap-4">
        <div className="text-sm text-slate-600 dark:text-slate-300 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {allMatching ? (
            <span>All {formatCount(targetCount)} transactions matching the current filters are selected.</span>
          ) : (
            <span>{transactionIds.length} transaction{transactionIds.length === 1 ? '' : 's'} selected</span>
          )}
          {canSelectAllMatching && (
            <button
              type="button"
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
              onClick={() => setAllMatching(v => !v)}
            >
              {allMatching
                ? `Select only the ${transactionIds.length}`
                : `Select all ${formatCount(matchingTotal!)} transactions`}
            </button>
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={categoryEnabled} onChange={e => setCategoryEnabled(e.target.checked)} />
            Change category
          </label>
          {categoryEnabled && (
            <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={renameEnabled} onChange={e => setRenameEnabled(e.target.checked)} />
            Rename
          </label>
          {renameEnabled && (
            <div>
              <div role="group" aria-label="Rename mode" className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden mb-2">
                {PAYEE_MODES.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={payeeMode === m.value}
                    onClick={() => setPayeeMode(m.value)}
                    className={payeeMode === m.value
                      ? 'px-3 py-1 text-sm bg-indigo-600 text-white'
                      : 'px-3 py-1 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Input
                aria-label={PAYEE_MODES.find(m => m.value === payeeMode)!.placeholder}
                placeholder={PAYEE_MODES.find(m => m.value === payeeMode)!.placeholder}
                value={payee}
                onChange={e => setPayee(e.target.value)}
              />
              <div className="text-xs text-slate-400 mt-1">
                {payeeMode === 'replace'
                  ? 'Every selected transaction gets this payee.'
                  : `Added ${payeeMode === 'prepend' ? 'before' : 'after'} each transaction's own payee, exactly as typed (include a space if you want one).`}
                {' '}Memos and original bank labels are kept.
              </div>
              {payeeMode !== 'replace' && previewTransaction && payee.trim() !== '' && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  e.g. <span className="font-medium text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{renamedPayee(previewTransaction.payee, payee, payeeMode)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {moveAccounts && (
          <div className="border border-red-300 dark:border-red-800 rounded-md p-3">
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <input type="checkbox" checked={moveEnabled} onChange={e => setMoveEnabled(e.target.checked)} />
              Move to another account
              <span className="text-[11px] font-semibold uppercase text-red-600 dark:text-red-400">Admin</span>
            </label>
            {moveEnabled && (
              <div>
                <AccountPicker
                  accounts={moveAccounts}
                  value={moveAccountId}
                  onChange={setMoveAccountId}
                  allowEmpty={false}
                  placeholder="Target account"
                />
                <div className="text-xs text-slate-400 mt-1">
                  Each transaction keeps its own split. A bank-synced transaction less than a week old may come back
                  on its old account at the next sync.
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={offsetEnabled} onChange={e => setOffsetEnabled(e.target.checked)} />
            Shift accounting month
          </label>
          {offsetEnabled && (
            <div>
              <Select value={offset} onChange={e => setOffset(parseInt(e.target.value))} className="min-w-[160px]">
                {ACCOUNTING_MONTH_OFFSETS.map(o => <option key={o} value={o}>{offsetLabel(o)}</option>)}
              </Select>
              <div className="text-xs text-slate-400 mt-1">Applied relative to each transaction's own date.</div>
            </div>
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={splitEnabled} onChange={e => setSplitEnabled(e.target.checked)} />
            Apply new split
          </label>
          {splitEnabled && previewTransaction && (
            <div>
              <TransactionSplitFields
                rows={splitRows}
                onChange={setSplitRows}
                amount={previewTransaction.amount}
                currency={previewTransaction.currency}
                allUsers={allUsers}
                account={null}
                category={null}
                globalWeights={globalWeights}
                source={splitSource}
                onSourceChange={setSplitSource}
              />
              <div className="text-xs text-slate-400 mt-1">
                Preview uses {previewTransaction.payee}'s amount{currencies.length > 1 ? ` (across ${currencies.length} currencies)` : ` (${previewTransaction.currency})`} —
                {' '}each transaction is proportioned against its own amount when applied.
              </div>
            </div>
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-md p-3">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <input type="checkbox" checked={reconciledEnabled} onChange={e => setReconciledEnabled(e.target.checked)} />
            Mark as reconciled / unreconciled
          </label>
          {reconciledEnabled && (
            <Select value={reconciledValue ? 'true' : 'false'} onChange={e => setReconciledValue(e.target.value === 'true')} className="min-w-[160px]">
              <option value="true">Reconciled</option>
              <option value="false">Not reconciled</option>
            </Select>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!canSave || saving}>
            Apply to {formatCount(targetCount)} transaction{targetCount === 1 ? '' : 's'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
