import { useEffect, useState } from 'react'
import {
  Account, Category, CategorizerModel, CategorizerMetrics,
  TransactionSearchRequest,
  activateCategorizerModel, deleteCategorizerModel, fetchAccounts, fetchCategories,
  fetchCategorizerModels, searchTransactions, trainCategorizerModel,
} from '../api/client'
import TransactionConditions, { ConditionRow, conditionsToFilters } from './TransactionConditions'
import { BackButton, Badge, Button, Card, ConfirmDialog, Input, Select, StatusMessage, Table, Thead, Tbody, Tr, Th, Td } from './ui'
import { useToast } from '../context/ToastContext'
import { formatServerTimestamp } from '../utils/datetime'

interface Props {
  onBack: () => void
}

/** First day of the month `months` months before today, as "YYYY-MM-DD".
 *  Used only to seed the default split, so the page opens on a training and a
 *  test selection that are already disjoint. */
function monthsAgo(months: number, today: Date = new Date()): string {
  const total = today.getFullYear() * 12 + today.getMonth() - months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function isoToday(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

/** `null` while the count is in flight, `'error'` when it failed — a failed
 *  count must not keep reading as one still loading. */
type Count = number | 'error' | null

function describeCount(count: Count, noun = 'transactions selected'): string {
  if (count === 'error') return 'Could not count this selection'
  if (count === null) return 'Counting…'
  return `${count.toLocaleString()} ${noun}`
}

function pct(value: number | undefined | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

function statusBadge(model: CategorizerModel) {
  if (model.is_active) return <Badge variant="positive">Active</Badge>
  if (model.status === 'failed') return <Badge variant="negative">Failed</Badge>
  if (model.status === 'training') return <Badge variant="warning">Training…</Badge>
  return <Badge>Ready</Badge>
}

/** What a model scored when it was fitted, next to the rule it has to beat.
 *  The baseline is on screen rather than in a comment because it is the whole
 *  argument for activating a model at all. */
function ModelResults({ model }: { model: CategorizerModel }) {
  const metrics: CategorizerMetrics = model.metrics ?? {}
  const payee = metrics.payee ?? {}
  const baseline = metrics.baseline ?? {}

  if (model.status === 'failed') {
    return <p className="text-sm text-negative">Training failed: {model.error}</p>
  }
  if (model.status === 'training') {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Still training. This page will show its score once it finishes.</p>
  }
  if (!metrics.tested_rows) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">This model carries no score — its test selection held no filed transaction.</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Right category</div>
          <div className="text-xl font-semibold">{pct(metrics.accuracy)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Right parent category</div>
          <div className="text-xl font-semibold">{pct(metrics.parent_accuracy)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">In its top 3 guesses</div>
          <div className="text-xl font-semibold">{pct(metrics.top3_accuracy)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Simple merchant rule</div>
          <div className="text-xl font-semibold">{pct(baseline.accuracy)}</div>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Learned from {model.trained_rows.toLocaleString()} transactions, scored on {model.tested_rows.toLocaleString()} it
        never saw. The last figure is what you would get by always reusing the category a merchant was given most often —
        the model is only worth running if it beats that.
      </p>

      {metrics.thresholds && metrics.thresholds.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-1">How much it gets right when it is confident</h4>
          <Table>
            <Thead>
              <Tr>
                <Th>Confidence at least</Th>
                <Th>Transactions it speaks about</Th>
                <Th>Right category</Th>
                <Th>Right parent</Th>
              </Tr>
            </Thead>
            <Tbody>
              {metrics.thresholds.map(row => (
                <Tr key={row.threshold}>
                  <Td>{row.threshold.toFixed(1)}</Td>
                  <Td>{pct(row.coverage)}</Td>
                  <Td>{pct(row.accuracy)}</Td>
                  <Td>{pct(row.parent_accuracy)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-1">Names for recurring merchants</h4>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {payee.merchants
            ? <>Remembers a name for {payee.merchants.toLocaleString()} merchants. On the test transactions it proposes
                one for {pct(payee.coverage)} of them and gets it exactly right {pct(payee.precision)} of the time, and it
                stays silent on the rest.</>
            : <>No merchant was named consistently enough to remember. Lower the two settings below, or train on a longer
                period.</>}
        </p>
      </div>
    </div>
  )
}

export default function CategorizerPage({ onBack }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [models, setModels] = useState<CategorizerModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cutoff = monthsAgo(12)
  const [trainConditions, setTrainConditions] = useState<ConditionRow[]>(
    [{ field: 'date', operator: 'before', value: cutoff, value2: '' }])
  const [trainMatch, setTrainMatch] = useState<'all' | 'any'>('all')
  const [testConditions, setTestConditions] = useState<ConditionRow[]>(
    [{ field: 'date', operator: 'between', value: cutoff, value2: isoToday() }])
  const [testMatch, setTestMatch] = useState<'all' | 'any'>('all')
  const [trainCount, setTrainCount] = useState<Count>(null)
  const [testCount, setTestCount] = useState<Count>(null)

  const [note, setNote] = useState('')
  const [minOccurrences, setMinOccurrences] = useState('2')
  const [minStability, setMinStability] = useState('0.9')

  const [training, setTraining] = useState(false)
  const [trainError, setTrainError] = useState<string | null>(null)
  const [shownModelId, setShownModelId] = useState<number | null>(null)
  const [activatingId, setActivatingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<CategorizerModel | null>(null)
  const { showToast } = useToast()

  const loadModels = () =>
    fetchCategorizerModels()
      .then(rows => {
        setModels(rows)
        setShownModelId(current => current ?? rows.find(m => m.is_active)?.id ?? rows[0]?.id ?? null)
      })

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchAccounts(), fetchCategories(), loadModels()])
      .then(([a, c]) => { setAccounts(a); setCategories(c) })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }, [])

  // No `user_id` on either selection, deliberately: there is one model for the
  // whole household (so it learns from both people's filing), and scoping a
  // selection to the signed-in user would silently train on half the ledger.
  const selection = (conditions: ConditionRow[], matchMode: 'all' | 'any'): TransactionSearchRequest =>
    ({ match_mode: matchMode, conditions: conditionsToFilters(conditions) })

  const countFor = (conditions: ConditionRow[], matchMode: 'all' | 'any', set: (n: Count) => void) => {
    searchTransactions({ ...selection(conditions, matchMode), page: 1, page_size: 1 })
      .then(res => set(res.total))
      .catch(() => set('error'))
  }

  useEffect(() => {
    const id = setTimeout(() => countFor(trainConditions, trainMatch, setTrainCount), 400)
    return () => clearTimeout(id)
  }, [JSON.stringify(trainConditions), trainMatch])

  useEffect(() => {
    const id = setTimeout(() => countFor(testConditions, testMatch, setTestCount), 400)
    return () => clearTimeout(id)
  }, [JSON.stringify(testConditions), testMatch])

  const handleTrain = () => {
    setTraining(true)
    setTrainError(null)
    trainCategorizerModel({
      train: selection(trainConditions, trainMatch),
      test: selection(testConditions, testMatch),
      note: note.trim() || undefined,
      payee_min_occurrences: parseInt(minOccurrences, 10) || 2,
      payee_min_stability: parseFloat(minStability) || 0.9,
    })
      .then(model => {
        setShownModelId(model.id)
        showToast('Training finished. Look at the score before activating it.')
        return loadModels()
      })
      .catch(err => setTrainError(err.message))
      .finally(() => setTraining(false))
  }

  const handleActivate = (model: CategorizerModel) => {
    setActivatingId(model.id)
    activateCategorizerModel(model.id)
      .then(() => loadModels())
      .then(() => showToast('This model is now the active one.'))
      .catch(err => showToast(err.message))
      .finally(() => setActivatingId(null))
  }

  const handleDelete = () => {
    if (!deleting) return
    const id = deleting.id
    deleteCategorizerModel(id)
      .then(() => {
        setShownModelId(current => (current === id ? null : current))
        return loadModels()
      })
      .catch(err => showToast(err.message))
      .finally(() => setDeleting(null))
  }

  if (error) return <StatusMessage error={error} />
  if (loading) return <StatusMessage loading />

  const active = models.find(m => m.is_active) ?? null
  const shown = models.find(m => m.id === shownModelId) ?? null

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Auto-categorization</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
        Learns from the transactions you have already filed, so it can propose a category for the ones you have not —
        and the name you yourself gave a merchant you see every month. Training does not change a single transaction:
        it produces a model, tells you how well it scored, and leaves activating it to you.
      </p>

      <Card className="p-3 mb-3">
        {active
          ? <p className="text-sm">
              <strong>Active model:</strong> trained {formatServerTimestamp(active.created_at)} on{' '}
              {active.trained_rows.toLocaleString()} transactions, {pct(active.metrics?.accuracy)} right on its test period.
              {active.note && <> <span className="text-slate-500 dark:text-slate-400">({active.note})</span></>}
            </p>
          : <p className="text-sm text-slate-600 dark:text-slate-300">
              No model is active yet. Train one below, read its score, then activate it.
            </p>}
      </Card>

      <Card className="p-3 mb-3">
        <h3 className="text-sm font-semibold mb-1">1. What to learn from</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          The transactions whose categories you trust. Rows nobody has curated carry wrong labels rather than missing
          ones, so leaving an account out is often better than including it — add an "Account is not …" condition.
        </p>
        <TransactionConditions
          conditions={trainConditions}
          onChange={setTrainConditions}
          matchMode={trainMatch}
          onMatchModeChange={setTrainMatch}
          accounts={accounts}
          categories={categories}
        />
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
          {describeCount(trainCount)} — only those with both a category and an original label can be learned from.
        </p>
      </Card>

      <Card className="p-3 mb-3">
        <h3 className="text-sm font-semibold mb-1">2. What to score it on</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
          A period you have already filed, and which does not overlap the first selection — a model scored on the rows
          it learned from reports a precision it does not have. It opens on the last twelve months.
        </p>
        <TransactionConditions
          conditions={testConditions}
          onChange={setTestConditions}
          matchMode={testMatch}
          onMatchModeChange={setTestMatch}
          accounts={accounts}
          categories={categories}
        />
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
          {describeCount(testCount)}
        </p>
      </Card>

      <Card className="p-3 mb-3">
        <h3 className="text-sm font-semibold mb-2">3. Settings</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <label className="text-xs text-slate-600 dark:text-slate-300">
            <div className="mb-1">Note (optional)</div>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="What is different about this run" className="w-[260px]" />
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-300">
            <div className="mb-1">Propose a merchant's name after</div>
            <Select value={minOccurrences} onChange={e => setMinOccurrences(e.target.value)}>
              <option value="2">2 sightings</option>
              <option value="3">3 sightings</option>
              <option value="5">5 sightings</option>
              <option value="10">10 sightings</option>
            </Select>
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-300">
            <div className="mb-1">…if you named it the same way</div>
            <Select value={minStability} onChange={e => setMinStability(e.target.value)}>
              <option value="0.7">70% of the time</option>
              <option value="0.8">80% of the time</option>
              <option value="0.9">90% of the time</option>
              <option value="1">every single time</option>
            </Select>
          </label>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Raising either makes it propose fewer names and get more of them right. Categories are unaffected.
        </p>
      </Card>

      <div className="flex gap-3 items-center mb-3">
        <Button onClick={handleTrain} disabled={training}>
          {training ? 'Training…' : 'Train a model'}
        </Button>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {training
            ? 'This takes around fifteen seconds. Leave the page open.'
            : 'Takes around fifteen seconds. Nothing is applied and no transaction changes.'}
        </span>
      </div>

      {trainError && <p className="text-sm text-negative mb-3">{trainError}</p>}

      {shown && (
        <Card className="p-3 mb-3" role="region" aria-label="Model score">
          <div className="flex justify-between items-start mb-2 gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">
              Score of the model trained {formatServerTimestamp(shown.created_at)}
            </h3>
            {shown.status === 'ready' && !shown.is_active && (
              <Button size="sm" onClick={() => handleActivate(shown)} disabled={activatingId === shown.id}>
                {activatingId === shown.id ? 'Activating…' : 'Use this model'}
              </Button>
            )}
          </div>
          <ModelResults model={shown} />
        </Card>
      )}

      <Card className="p-3">
        <h3 className="text-sm font-semibold mb-2">Models</h3>
        {models.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No model trained yet.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Trained</Th>
                <Th>Note</Th>
                <Th>Learned from</Th>
                <Th>Score</Th>
                <Th>Status</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {models.map(model => (
                <Tr key={model.id}>
                  <Td>
                    <button
                      className="underline decoration-dotted"
                      onClick={() => setShownModelId(model.id)}
                    >
                      {formatServerTimestamp(model.created_at)}
                    </button>
                  </Td>
                  <Td>{model.note || '—'}</Td>
                  <Td>{model.trained_rows.toLocaleString()}</Td>
                  <Td>{pct(model.metrics?.accuracy)}</Td>
                  <Td>{statusBadge(model)}</Td>
                  <Td>
                    <div className="flex gap-2 justify-end">
                      {model.status === 'ready' && !model.is_active && (
                        <Button size="sm" variant="secondary" onClick={() => handleActivate(model)} disabled={activatingId === model.id}>
                          Use
                        </Button>
                      )}
                      {!model.is_active && (
                        <Button size="sm" variant="danger" onClick={() => setDeleting(model)}>Delete</Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Score is the share of its test transactions the model filed under exactly the right category. The five most
          recent models are kept, so you can go back to the previous one if a new one scores worse. The active model
          cannot be deleted — activate another one first.
        </p>
      </Card>

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete this model?"
        message="Its score is lost with it. Training another one takes about fifteen seconds."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
