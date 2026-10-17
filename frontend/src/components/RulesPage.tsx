import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  Account, Category, FilterCondition, GlobalSplitWeight, Rule, RuleActions, RuleInput, SplitSource, SplitTier, Tag, User,
  createRule, deleteRule, fetchAccounts, fetchCategories, fetchRules, fetchSplitWeights, fetchTags, fetchUsers,
  reorderRules, searchTransactions, updateRule,
} from '../api/client'
import TransactionConditions, {
  ConditionRow, FIELD_LABELS, OPERATORS_BY_FIELD, conditionsToFilters, emptyCondition,
} from './TransactionConditions'
import TransactionSplitFields from './TransactionSplitFields'
import CategoryPicker from './CategoryPicker'
import TagPicker from './TagPicker'
import { UNTAGGED_ID } from '../utils/tags'
import { UNCATEGORIZED_ID } from '../utils/categoryHierarchy'
import { SplitRow } from './SplitEditor'
import { BackButton, Badge, Button, Card, ConfirmDialog, IconButton, Input, Modal, Select, StatusMessage } from './ui'
import { useToast } from '../context/ToastContext'
import { RuleDraft, SPLIT_TIER_LABELS, describeActions, offsetLabel } from '../utils/rules'

interface Props {
  onBack: () => void
  // Conditions to open a new rule with (Transactions' "Create rule").
  draft?: RuleDraft | null
  onDraftUsed?: () => void
}

const ACCOUNTING_MONTH_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const
// The split preview needs an amount; a rule has none of its own.
const SPLIT_PREVIEW_AMOUNT = -100

function toRows(conditions: FilterCondition[]): ConditionRow[] {
  return conditions.map(c => ({
    field: c.field,
    operator: c.operator,
    value: c.value == null
      ? (c.field === 'category_id' ? String(UNCATEGORIZED_ID) : c.field === 'tag_id' ? String(UNTAGGED_ID) : '')
      : String(c.value),
    value2: c.value2 == null ? '' : String(c.value2),
  }))
}

function describeCondition(c: FilterCondition, accounts: Account[], categories: Category[], tags: Tag[]): string {
  const op = OPERATORS_BY_FIELD[c.field].find(o => o.value === c.operator)?.label ?? c.operator
  const show = (v: string | number | null | undefined) => {
    if (c.field === 'account_id') return accounts.find(a => a.id === Number(v))?.name ?? `#${v}`
    if (c.field === 'category_id') return v == null ? 'Uncategorized' : categories.find(x => x.id === Number(v))?.name ?? `#${v}`
    if (c.field === 'tag_id') return v == null ? 'No tag' : `#${tags.find(x => x.id === Number(v))?.name ?? v}`
    return typeof v === 'string' ? `"${v}"` : String(v)
  }
  return `${FIELD_LABELS[c.field]} ${op} ${show(c.value)}${c.operator === 'between' ? ` and ${show(c.value2)}` : ''}`
}

interface EditorProps {
  rule: Rule | null
  draft?: RuleDraft | null
  accounts: Account[]
  categories: Category[]
  tags: Tag[]
  onTagCreated: (tag: Tag) => void
  allUsers: User[]
  globalWeights: GlobalSplitWeight[]
  onClose: () => void
  onSaved: () => void
}

/** Create or edit one rule: the advanced filter's conditions, then the actions. */
function RuleEditor({
  rule, draft, accounts, categories, tags, onTagCreated, allUsers, globalWeights, onClose, onSaved,
}: EditorProps) {
  const actions: RuleActions = rule?.actions ?? {}
  const [name, setName] = useState(rule?.name ?? '')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [conditions, setConditions] = useState<ConditionRow[]>(
    rule ? toRows(rule.conditions) : draft ? toRows(draft.conditions) : [{ ...emptyCondition, field: 'raw_label' }])
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(rule?.match_mode ?? draft?.match_mode ?? 'all')

  const [payeeEnabled, setPayeeEnabled] = useState(actions.payee != null)
  const [payee, setPayee] = useState(actions.payee ?? '')
  const [categoryEnabled, setCategoryEnabled] = useState(actions.category_id != null)
  const [categoryId, setCategoryId] = useState<number | null>(actions.category_id ?? null)
  const [offsetEnabled, setOffsetEnabled] = useState(actions.accounting_month_offset != null)
  const [offset, setOffset] = useState(actions.accounting_month_offset ?? 0)
  const [splitEnabled, setSplitEnabled] = useState(!!actions.split_weights?.length || !!actions.split_tier)
  // A tier is read when the rule runs; 'fixed' stores the weights in the rule.
  const [splitMode, setSplitMode] = useState<SplitTier | 'fixed'>(
    actions.split_tier ?? (actions.split_weights?.length ? 'fixed' : 'global'))
  const [splitRows, setSplitRows] = useState<SplitRow[]>(
    (actions.split_weights ?? []).map(w => ({ user_id: w.user_id, value: w.weight })))
  const [splitSource, setSplitSource] = useState<SplitSource | null>(actions.split_source ?? null)
  const [reconciledEnabled, setReconciledEnabled] = useState(actions.reconciled != null)
  const [reconciled, setReconciled] = useState(actions.reconciled ?? true)
  const [tagsEnabled, setTagsEnabled] = useState(!!actions.add_tag_ids?.length)
  const [addTagIds, setAddTagIds] = useState<number[]>(actions.add_tag_ids ?? [])

  const [matching, setMatching] = useState<number | null | 'error'>(null)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const filters = conditionsToFilters(conditions)
  const filtersKey = JSON.stringify(filters) + matchMode

  // How many existing transactions the conditions catch, through the same
  // search the Transactions screen uses: the quickest check that a condition
  // says what was meant.
  useEffect(() => {
    if (filters.length === 0) { setMatching(null); return }
    const id = setTimeout(() => {
      searchTransactions({ conditions: filters, match_mode: matchMode, page: 1, page_size: 1 })
        .then(res => setMatching(res.total))
        .catch(() => setMatching('error'))
    }, 400)
    return () => clearTimeout(id)
  }, [filtersKey])

  const anyAction = payeeEnabled || categoryEnabled || offsetEnabled || splitEnabled || reconciledEnabled
    || (tagsEnabled && addTagIds.length > 0)
  const canSave = name.trim() !== '' && filters.length > 0 && anyAction
    && !(payeeEnabled && payee.trim() === '') && !(categoryEnabled && categoryId == null)
    && !(splitEnabled && splitMode === 'fixed' && splitRows.length === 0)

  const save = () => {
    const data: RuleInput = {
      name: name.trim(),
      enabled,
      match_mode: matchMode,
      conditions: filters,
      actions: {
        ...(payeeEnabled ? { payee: payee.trim() } : {}),
        ...(categoryEnabled && categoryId != null ? { category_id: categoryId } : {}),
        ...(offsetEnabled ? { accounting_month_offset: offset } : {}),
        ...(reconciledEnabled ? { reconciled } : {}),
        ...(tagsEnabled && addTagIds.length > 0 ? { add_tag_ids: addTagIds } : {}),
        ...(splitEnabled && splitMode !== 'fixed' ? { split_tier: splitMode } : {}),
        ...(splitEnabled && splitMode === 'fixed' ? {
          split_weights: splitRows.map(r => ({ user_id: r.user_id, weight: r.value })),
          split_source: splitSource ?? 'custom',
        } : {}),
      },
    }
    setSaving(true)
    const call = rule ? updateRule(rule.id, data) : createRule(data)
    call
      .then(() => { showToast('Rule saved', 'success'); onSaved() })
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  const section = 'border border-slate-200 dark:border-slate-700 rounded-md p-3'
  const actionLabel = 'flex items-center gap-2 text-sm font-medium'
  const category = categories.find(c => c.id === categoryId) ?? null

  return (
    <Modal isOpen size="lg" onClose={onClose} title={rule ? 'Edit rule' : 'New rule'}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 flex-wrap items-end">
          <label className="text-xs text-slate-600 dark:text-slate-300 flex-1 min-w-[200px]">
            <div className="mb-1">Name</div>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SFR phone bill" className="w-full" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>

        <div className={section}>
          <h3 className="text-sm font-semibold mb-1">When a transaction matches</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            "Original label" is the bank's own wording, before any cleanup or renaming: the steadiest way to recognise
            a merchant.
          </p>
          <TransactionConditions
            conditions={conditions}
            onChange={setConditions}
            matchMode={matchMode}
            onMatchModeChange={setMatchMode}
            accounts={accounts}
            categories={categories}
            tags={tags}
          />
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
            {filters.length === 0
              ? 'Add at least one condition.'
              : matching === 'error' ? 'Could not count the matching transactions'
              : matching === null ? 'Counting…'
              : `${matching.toLocaleString()} existing transaction${matching === 1 ? '' : 's'} match today.`}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Then</h3>

          <div className={section}>
            <label className={actionLabel}>
              <input type="checkbox" checked={payeeEnabled} onChange={e => setPayeeEnabled(e.target.checked)} />
              Rename payee
            </label>
            {payeeEnabled && (
              <Input value={payee} onChange={e => setPayee(e.target.value)} placeholder="New payee"
                     aria-label="New payee" className="mt-2 w-full max-w-sm" />
            )}
          </div>

          <div className={section}>
            <label className={actionLabel}>
              <input type="checkbox" checked={categoryEnabled} onChange={e => setCategoryEnabled(e.target.checked)} />
              Set category
            </label>
            {categoryEnabled && (
              <div className="mt-2"><CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} /></div>
            )}
          </div>

          <div className={section}>
            <label className={actionLabel}>
              <input type="checkbox" checked={tagsEnabled} onChange={e => setTagsEnabled(e.target.checked)} />
              Add tags
            </label>
            {tagsEnabled && (
              <div className="mt-2 max-w-sm">
                <TagPicker tags={tags} value={addTagIds} onChange={setAddTagIds} onCreated={onTagCreated} />
                <div className="text-xs text-slate-400 mt-1">Added to the tags the transaction already has.</div>
              </div>
            )}
          </div>

          <div className={section}>
            <label className={actionLabel}>
              <input type="checkbox" checked={offsetEnabled} onChange={e => setOffsetEnabled(e.target.checked)} />
              Shift accounting month
            </label>
            {offsetEnabled && (
              <Select value={offset} onChange={e => setOffset(parseInt(e.target.value))} className="mt-2 min-w-[160px]">
                {ACCOUNTING_MONTH_OFFSETS.map(o => <option key={o} value={o}>{offsetLabel(o)}</option>)}
              </Select>
            )}
          </div>

          <div className={section}>
            <label className={actionLabel}>
              <input type="checkbox" checked={splitEnabled} onChange={e => setSplitEnabled(e.target.checked)} />
              Set split
            </label>
            {splitEnabled && (
              <div className="mt-2">
                <Select aria-label="Split to apply" value={splitMode}
                        onChange={e => setSplitMode(e.target.value as SplitTier | 'fixed')} className="min-w-[160px]">
                  {(Object.keys(SPLIT_TIER_LABELS) as SplitTier[]).map(t =>
                    <option key={t} value={t}>{SPLIT_TIER_LABELS[t]}</option>)}
                  <option value="fixed">Fixed weights</option>
                </Select>
              </div>
            )}
            {splitEnabled && splitMode !== 'fixed' && (
              <div className="text-xs text-slate-400 mt-1">
                Read from the split settings each time the rule runs, so changing them there changes what this rule
                applies. Left as is when that split isn't set for the transaction.
              </div>
            )}
            {splitEnabled && splitMode === 'fixed' && (
              <div>
                <TransactionSplitFields
                  rows={splitRows}
                  onChange={setSplitRows}
                  amount={SPLIT_PREVIEW_AMOUNT}
                  currency="EUR"
                  allUsers={allUsers}
                  account={null}
                  category={category}
                  globalWeights={globalWeights}
                  source={splitSource}
                  onSourceChange={setSplitSource}
                />
                <div className="text-xs text-slate-400 mt-1">
                  Amounts shown for a 100 € expense; each transaction is shared against its own amount.
                </div>
              </div>
            )}
          </div>

          <div className={section}>
            <label className={actionLabel}>
              <input type="checkbox" checked={reconciledEnabled} onChange={e => setReconciledEnabled(e.target.checked)} />
              Mark as reconciled / not reconciled
            </label>
            {reconciledEnabled ? (
              <Select value={reconciled ? 'true' : 'false'} onChange={e => setReconciled(e.target.value === 'true')}
                      className="mt-2 min-w-[160px]">
                <option value="true">Reconciled</option>
                <option value="false">Not reconciled</option>
              </Select>
            ) : (
              <div className="text-xs text-slate-400 mt-1">
                Left off, the rule doesn't change whether a transaction is reconciled.
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save rule'}</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

/** The automatic rules: what they are, their order, and their editor. */
export default function RulesPage({ onBack, draft, onDraftUsed }: Props) {
  const [rules, setRules] = useState<Rule[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [globalWeights, setGlobalWeights] = useState<GlobalSplitWeight[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Rule | 'new' | null>(draft ? 'new' : null)
  // The draft only seeds the editor it opened, not a later "+ New rule".
  const [initialDraft, setInitialDraft] = useState(draft ?? null)
  useEffect(() => { if (draft) onDraftUsed?.() }, [])
  const [deleting, setDeleting] = useState<Rule | null>(null)
  const { showToast } = useToast()

  const load = () => fetchRules().then(setRules).catch(err => setError(err.message))

  useEffect(() => {
    Promise.all([fetchRules(), fetchAccounts(), fetchCategories(), fetchUsers(), fetchSplitWeights(), fetchTags()])
      .then(([r, a, c, u, w, t]) => {
        setRules(r); setAccounts(a); setCategories(c); setAllUsers(u); setGlobalWeights(w); setTags(t)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const save = (rule: Rule, patch: Partial<RuleInput>) => {
    const { name, enabled, match_mode, conditions, actions } = { ...rule, ...patch }
    updateRule(rule.id, { name, enabled, match_mode, conditions, actions })
      .then(load)
      .catch(err => showToast(err.message))
  }

  const move = (index: number, delta: number) => {
    const ids = rules.map(r => r.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + delta, 0, id)
    reorderRules(ids).then(setRules).catch(err => showToast(err.message))
  }

  const confirmDelete = () => {
    if (!deleting) return
    deleteRule(deleting.id)
      .then(() => { setDeleting(null); load() })
      .catch(err => showToast(err.message))
  }

  const categoryName = (id: number) => categories.find(c => c.id === id)?.name ?? `#${id}`
  const tagName = (id: number) => `#${tags.find(t => t.id === id)?.name ?? id}`

  if (error) return <StatusMessage error={error} />

  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rules</h2>
        <Button onClick={() => setEditing('new')}>+ New rule</Button>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
        A rule files, renames, tags or splits the transactions that match its conditions. Enabled rules run on their own on
        every bank sync, are proposed on the Import screen, and can be run on a selection from Transactions. They run
        top to bottom, each one on the result of the ones above, so the lower rule wins when two change the same thing.
        Rules run after automatic categorization and win over it.
      </p>

      <StatusMessage loading={loading} />
      {!loading && rules.length === 0 && (
        <Card className="p-3 text-sm text-slate-500 dark:text-slate-400">No rule yet.</Card>
      )}

      <div className="space-y-2">
        {rules.map((rule, index) => (
          <Card key={rule.id} className={`p-3 ${rule.enabled ? '' : 'opacity-70'}`}>
            <div className="flex items-start gap-2">
              <div className="flex flex-col">
                <IconButton aria-label={`Move ${rule.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton aria-label={`Move ${rule.name} down`} disabled={index === rules.length - 1}
                            onClick={() => move(index, 1)}>
                  <ArrowDown size={14} />
                </IconButton>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{rule.name}</span>
                  {!rule.enabled && <Badge>Off</Badge>}
                </div>
                <div className="text-[13px] text-slate-600 dark:text-slate-300 mt-1">
                  <span className="text-slate-500 dark:text-slate-400">When </span>
                  {rule.conditions.map(c => describeCondition(c, accounts, categories, tags))
                    .join(rule.match_mode === 'all' ? ' and ' : ' or ')}
                </div>
                <div className="text-[13px] text-slate-600 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">Then </span>
                  {describeActions(rule.actions, allUsers, categoryName, tagName).join(', ')}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-1 shrink-0 items-end">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" aria-label={`Enable ${rule.name}`} checked={rule.enabled}
                         onChange={e => save(rule, { enabled: e.target.checked })} />
                  On
                </label>
                <Button size="sm" variant="secondary" onClick={() => setEditing(rule)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(rule)}>Delete</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {editing !== null && (
        <RuleEditor
          rule={editing === 'new' ? null : editing}
          draft={editing === 'new' ? initialDraft : null}
          accounts={accounts}
          categories={categories}
          tags={tags}
          onTagCreated={tag => setTags(ts => [...ts, tag].sort((a, b) => a.name.localeCompare(b.name)))}
          allUsers={allUsers}
          globalWeights={globalWeights}
          onClose={() => { setEditing(null); setInitialDraft(null) }}
          onSaved={() => { setEditing(null); setInitialDraft(null); load() }}
        />
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete this rule?"
        message="Transactions it already changed stay as they are."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
