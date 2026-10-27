import { useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import {
  Transaction, TransactionUpdate, TransactionHistoryEntry, GlobalSplitWeight, SplitSource,
  Account, Category, User, Tag,
  fetchTransaction, createTransaction, updateTransaction, deleteTransaction, fetchTransactionHistory,
  fetchDivideSiblings,
} from '../api/client'
import { SplitRow } from './SplitEditor'
import TransactionSplitFields from './TransactionSplitFields'
import TransactionDivideModal from './TransactionDivideModal'
import CategoryPicker from './CategoryPicker'
import PayeeInput from './PayeeInput'
import AccountPicker from './AccountPicker'
import TransactionRawFields from './TransactionRawFields'
import TransactionLinkSection from './TransactionLinkSection'
import TagPicker from './TagPicker'
import { useToast } from '../context/ToastContext'
import { validateTransactionForm, ACCOUNTING_MONTH_OFFSETS, accountingMonthLabel, checkpointPeriodLabel } from '../utils/transactions'
import { resolveDefaultSplitRows } from '../utils/splitWeights'
import { formatServerTimestamp } from '../utils/datetime'
import { formatMoney } from '../utils/currency'
import { isAdminMode } from '../utils/admin'
import { historyBadgeVariant, historyBadgeLabel, describeHistoryChanges } from '../utils/history'
import { whatsAppShareUrl } from '../utils/whatsapp'
import WhatsAppIcon from './WhatsAppIcon'
import { Modal, Button, Input, Select, StatusMessage, ConfirmDialog, Badge, NumberInput } from './ui'

interface Props {
  transactionId: number | null
  accounts: Account[]
  categories: Category[]
  tags?: Tag[]
  // A tag created from the form, for the caller to add to its list.
  onTagCreated?: (tag: Tag) => void
  allUsers: User[]
  globalWeights: GlobalSplitWeight[]
  selectedUserId: number | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  onNavigateToTransaction?: (id: number) => void
  // A link was renamed or undone from the detail panel, so the list behind it
  // may show a stale link icon.
  onLinksChanged?: () => void
}

const emptyFormData: TransactionUpdate = {
  date: new Date().toISOString().slice(0, 10),
  payee: '',
  memo: '',
  amount: 0,
  account_id: 0,
  category_id: 0,
  accounting_month_offset: 0,
}

export default function TransactionDetail({
  transactionId, accounts, categories, tags = [], onTagCreated, allUsers, globalWeights, selectedUserId, onClose, onSaved, onDeleted,
  onNavigateToTransaction,
  onLinksChanged,
}: Props) {
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(transactionId !== null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<TransactionUpdate>(() => transactionId === null ? emptyFormData : {})
  const [split, setSplit] = useState<SplitRow[]>([])
  const [splitSource, setSplitSource] = useState<SplitSource | null>(null)
  const [tagIds, setTagIds] = useState<number[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [dividing, setDividing] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<TransactionHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(transactionId !== null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [divideSiblings, setDivideSiblings] = useState<Transaction[]>([])
  const [adminMode] = useState(isAdminMode)
  // A new transaction can be created as a checkpoint; an existing one is one
  // for good (see checkpoints.py).
  const [newCheckpoint, setNewCheckpoint] = useState(false)
  const { showToast } = useToast()
  // Date, amount and account are what the bank (or the migration) reported, so
  // an existing transaction shows them as plain text. Only creating one, or
  // admin mode, opens them for editing, in their own section above the split.
  const coreEditable = transactionId === null || adminMode

  useEffect(() => {
    if (transactionId === null) return

    setLoading(true)
    setError(null)
    fetchTransaction(transactionId, selectedUserId)
      .then(t => {
        setTransaction(t)
        setFormData({
          date: t.date,
          payee: t.payee,
          memo: t.memo,
          amount: t.amount,
          account_id: t.account_id,
          category_id: t.category_id,
          accounting_month_offset: t.accounting_month_offset,
          reconciled: t.reconciled,
          ...(t.checkpoint_value != null ? { checkpoint_value: t.checkpoint_value } : {}),
        })
        // Always populated from the transaction's own stored weights — never
        // re-prefilled from current tier config while editing. The 3 quick
        // buttons are the only way to pull a tier's weights into this form.
        setSplit(t.splits.map(s => ({ user_id: s.user_id, value: s.weight })))
        setSplitSource(t.splits[0]?.source ?? null)
        setTagIds((t.tags ?? []).map(tag => tag.id))
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))

    setHistoryLoading(true)
    setHistoryError(null)
    fetchTransactionHistory(transactionId)
      .then(setHistoryEntries)
      .catch(err => setHistoryError(err.message))
      .finally(() => setHistoryLoading(false))

    setDivideSiblings([])
    fetchDivideSiblings(transactionId).then(setDivideSiblings).catch(() => {})
  }, [transactionId, selectedUserId])

  // Prefill a new transaction's split from account > category > global priority
  // whenever category/account selection changes — but never once the user has
  // hand-edited weights (source === 'custom'), which always wins. Editing an
  // existing transaction never re-prefills like this (see comment above).
  useEffect(() => {
    if (transactionId !== null || splitSource === 'custom') return
    const category = categories.find(c => c.id === formData.category_id) ?? null
    const account = accounts.find(a => a.id === formData.account_id) ?? null
    const { rows, source } = resolveDefaultSplitRows(category, account, globalWeights)
    setSplit(rows)
    setSplitSource(source)
  }, [transactionId, formData.category_id, formData.account_id])

  const save = () => {
    const validationError = validateTransactionForm(formData.payee, formData.account_id, split)
    if (validationError) {
      showToast(validationError); return
    }
    const request = transactionId === null
      ? createTransaction({
          date: formData.date || new Date().toISOString().slice(0, 10),
          payee: formData.payee ?? '',
          memo: formData.memo,
          // A checkpoint's amount is worked out by the server from its value.
          amount: newCheckpoint ? 0 : formData.amount ?? 0,
          checkpoint_value: newCheckpoint ? formData.checkpoint_value ?? 0 : undefined,
          account_id: formData.account_id ?? 0,
          category_id: formData.category_id || null,
          accounting_month_offset: formData.accounting_month_offset ?? undefined,
          split_weights: split.map(r => ({ user_id: r.user_id, weight: r.value })),
          split_source: splitSource ?? 'custom',
          tag_ids: tagIds,
        }, selectedUserId)
      : updateTransaction(transactionId, {
          ...(coreEditable ? formData : { ...formData, date: undefined, amount: undefined, account_id: undefined }),
          // Never sent for a checkpoint: it is derived from the value.
          ...(isCheckpoint ? { amount: undefined } : {}),
          category_id: formData.category_id || null,
          split_weights: split.map(r => ({ user_id: r.user_id, weight: r.value })),
          split_source: splitSource ?? 'custom',
          tag_ids: tagIds,
        }, selectedUserId)
    request.then(() => onSaved()).catch(err => showToast(err.message))
  }

  const confirmDelete = () => {
    if (transactionId === null) return
    deleteTransaction(transactionId, selectedUserId)
      .then(() => onDeleted())
      .catch(err => showToast(err.message))
      .finally(() => setConfirmingDelete(false))
  }

  const handleDivided = () => {
    setDividing(false)
    onSaved()
  }

  // A non-anchor sibling (divide_group_id set to a different transaction's
  // id) can't be divided again directly — divide the group's anchor instead.
  const isNonAnchorDivideSibling = transaction != null
    && transaction.divide_group_id != null
    && transaction.divide_group_id !== transaction.id

  const isCheckpoint = transactionId === null ? newCheckpoint : transaction?.checkpoint_value != null

  const currency = accounts.find(a => a.id === formData.account_id)?.currency ?? 'EUR'
  // Archived accounts are hidden from the picker when creating a new transaction, but
  // an existing transaction already on one must keep showing/saving its own account.
  const pickerAccounts = transactionId === null ? accounts.filter(a => !a.archived) : accounts

  return (
    <Modal
      isOpen
      size="lg"
      onClose={onClose}
      title={transactionId === null ? 'New Transaction' : (transaction?.payee ?? 'Transaction')}
      titleActions={transaction && transactionId !== null && (
        // Shares the transaction as saved, not the form's unsaved edits.
        <a
          href={whatsAppShareUrl(transaction)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on WhatsApp"
          title="Share on WhatsApp"
          className="shrink-0 inline-flex items-center justify-center rounded p-1 text-[#25D366] hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <WhatsAppIcon size={18} />
        </a>
      )}
    >
      {loading && <StatusMessage loading />}
      {error && <StatusMessage error={error} />}
      {!loading && !error && (
        <div className="flex flex-col gap-3">
          {!coreEditable && (
            <div className="flex gap-x-3 gap-y-0.5 flex-wrap items-baseline text-sm text-slate-600 dark:text-slate-300" data-testid="transaction-core-fields">
              <span>{formData.date}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(formData.amount ?? 0, currency)}</span>
              <span>{accounts.find(a => a.id === formData.account_id)?.name ?? transaction?.account_name}</span>
            </div>
          )}

          <div className="flex gap-2 flex-wrap items-end">
            <PayeeInput
              className="basis-full w-full"
              value={formData.payee ?? ''}
              categories={categories}
              excludeId={transactionId}
              onChange={payee => setFormData(f => ({ ...f, payee }))}
              onPick={s => setFormData(f => ({ ...f, payee: s.payee, category_id: s.category_id }))}
            />
            <textarea
              placeholder="Memo"
              rows={2}
              value={formData.memo ?? ''}
              onChange={e => setFormData({ ...formData, memo: e.target.value || null })}
              className="basis-full w-full resize-y rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-2 text-base md:text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
            <CategoryPicker
              categories={categories}
              value={formData.category_id ?? null}
              onChange={id => setFormData({ ...formData, category_id: id })}
              className="min-w-[140px]"
            />
            {transactionId !== null && (
              <label className="flex items-center gap-1.5 text-sm px-1">
                <input
                  type="checkbox"
                  checked={formData.reconciled ?? false}
                  onChange={e => setFormData({ ...formData, reconciled: e.target.checked })}
                />
                Reconciled
              </label>
            )}
            <Select
              aria-label="Accounting month"
              value={formData.accounting_month_offset ?? 0}
              onChange={e => setFormData({ ...formData, accounting_month_offset: parseInt(e.target.value) })}
              className="min-w-[160px]"
            >
              {ACCOUNTING_MONTH_OFFSETS.map(o => (
                <option key={o} value={o}>{accountingMonthLabel(formData.date ?? '', o)}</option>
              ))}
            </Select>
          </div>

          <TagPicker
            tags={tags}
            value={tagIds}
            onChange={setTagIds}
            onCreated={onTagCreated}
          />

          {coreEditable && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700" data-testid="transaction-core-editor">
              {transactionId !== null && (
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1.5">Date, amount and account (admin)</h4>
              )}
              <div className="flex gap-2 flex-wrap items-end">
                <Input type="date" aria-label="Date" value={formData.date ?? ''} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                {!isCheckpoint && (
                  <NumberInput placeholder="Amount" signed value={formData.amount ?? 0} onValueChange={v => setFormData({ ...formData, amount: v ?? 0 })} className="w-[110px]" />
                )}
                {transactionId === null && isCheckpoint && (
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    Account value
                    <NumberInput
                      aria-label="Account value"
                      placeholder="Account value"
                      signed
                      value={formData.checkpoint_value ?? 0}
                      onValueChange={v => setFormData({ ...formData, checkpoint_value: v ?? 0 })}
                      className="w-[130px]"
                    />
                  </label>
                )}
                <AccountPicker
                  accounts={pickerAccounts}
                  value={formData.account_id || null}
                  onChange={id => setFormData({ ...formData, account_id: id ?? 0 })}
                  placeholder="Choose account"
                  allowEmpty={false}
                  className="min-w-[140px]"
                />
              </div>
              {transactionId === null && (
                <label className="flex items-center gap-1.5 text-sm px-1 mt-2">
                  <input
                    type="checkbox"
                    checked={newCheckpoint}
                    onChange={e => setNewCheckpoint(e.target.checked)}
                  />
                  Checkpoint: enter what the account is worth on this date
                </label>
              )}
              {transactionId === null && isCheckpoint && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 px-1">
                  The amount will be the gain or loss since the balance before this date, worked out on save.
                </p>
              )}
            </div>
          )}

          {transactionId !== null && isCheckpoint && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700" data-testid="checkpoint-section">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                <Flag size={15} className="text-accent" /> Checkpoint
              </h4>
              <div className="flex gap-2 flex-wrap items-center text-sm">
                <span className="text-slate-600 dark:text-slate-300">Account value on {formData.date}</span>
                <NumberInput
                  aria-label="Account value"
                  signed
                  value={formData.checkpoint_value ?? 0}
                  onValueChange={v => setFormData({ ...formData, checkpoint_value: v ?? 0 })}
                  className="w-[130px]"
                />
                <span className="text-slate-500 dark:text-slate-400">{currency}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                The amount ({formatMoney(transaction?.amount ?? 0, currency)}) is the gain or loss{' '}
                <span data-testid="checkpoint-period" className="font-medium text-slate-700 dark:text-slate-200">
                  {checkpointPeriodLabel(transaction?.checkpoint_since)}
                </span>
                {transaction?.checkpoint_since ? ' (previous checkpoint)' : ' (first checkpoint)'}, deposits and withdrawals
                in between excluded. It is worked out again whenever an earlier transaction of the account changes.
              </p>
            </div>
          )}

          <TransactionSplitFields
            rows={split}
            onChange={setSplit}
            amount={formData.amount ?? 0}
            currency={currency}
            allUsers={allUsers}
            account={accounts.find(a => a.id === formData.account_id) ?? null}
            category={categories.find(c => c.id === formData.category_id) ?? null}
            globalWeights={globalWeights}
            source={splitSource}
            onSourceChange={setSplitSource}
          />

          <div className="flex gap-2">
            <Button onClick={save}>Save</Button>
            {transactionId !== null && !isNonAnchorDivideSibling && !isCheckpoint && (
              <Button variant="secondary" onClick={() => setDividing(true)}>Divide</Button>
            )}
            {transactionId !== null && (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>Delete</Button>
            )}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>

          {transactionId !== null && divideSiblings.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Divided transaction — {divideSiblings.length} other part{divideSiblings.length === 1 ? '' : 's'}
              </h4>
              <div className="flex flex-col gap-1">
                {divideSiblings.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigateToTransaction?.(s.id)}
                    disabled={!onNavigateToTransaction}
                    className="text-left text-xs px-1 py-0.5 rounded text-accent hover:underline disabled:no-underline disabled:cursor-default disabled:text-slate-500"
                  >
                    {s.payee} — {s.amount.toFixed(2)} {s.currency} ({s.date})
                  </button>
                ))}
              </div>
            </div>
          )}

          {transaction && (
            <TransactionLinkSection
              transaction={transaction}
              actorUserId={selectedUserId}
              onNavigateToTransaction={onNavigateToTransaction}
              onChanged={linkId => {
                setTransaction({ ...transaction, link_id: linkId })
                fetchTransactionHistory(transaction.id).then(setHistoryEntries).catch(() => {})
                onLinksChanged?.()
              }}
            />
          )}

          {transaction && (
            <TransactionRawFields
              transaction={transaction}
              adminMode={adminMode}
              actorUserId={selectedUserId}
              onSaved={saved => {
                setTransaction(saved)
                fetchTransactionHistory(saved.id).then(setHistoryEntries).catch(() => {})
              }}
            />
          )}

          {transactionId !== null && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">History</h4>
              {historyLoading && <StatusMessage loading />}
              {historyError && <StatusMessage error={historyError} />}
              {!historyLoading && !historyError && historyEntries.length === 0 && (
                <div className="text-xs text-slate-400 py-1">No history recorded for this transaction</div>
              )}
              {!historyLoading && !historyError && historyEntries.length > 0 && (
                <div className="flex flex-col gap-1.5 py-1">
                  {historyEntries.map(h => (
                    <div key={h.id} className="flex items-center gap-2 text-xs flex-wrap">
                      <Badge variant={historyBadgeVariant(h.action)}>
                        {historyBadgeLabel(h.action, h.source)}
                      </Badge>
                      <span className="text-slate-500 dark:text-slate-400">{formatServerTimestamp(h.changed_at)}</span>
                      <span className="text-slate-500 dark:text-slate-400">by {h.changed_by_user_name ?? 'Unknown user'}</span>
                      {h.changes && (
                        <span className="text-slate-700 dark:text-slate-200">{describeHistoryChanges(h.changes, allUsers, categories)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {transactionId !== null && (
        <ConfirmDialog
          isOpen={confirmingDelete}
          title="Delete transaction"
          message={`Delete transaction "${transaction?.payee}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {dividing && transaction && (
        <TransactionDivideModal
          transaction={transaction}
          categories={categories}
          selectedUserId={selectedUserId}
          onClose={() => setDividing(false)}
          onDivided={handleDivided}
        />
      )}
    </Modal>
  )
}
