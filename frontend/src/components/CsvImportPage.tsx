import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Account, Category, ImportPreviewRow, TransactionCreate,
  fetchAccounts, fetchCategories, previewImport, commitImport,
} from '../api/client'
import { Button, Input, Select, Card, Table, Thead, Tbody, Tr, Th, Td, Badge, StatusMessage } from './ui'

interface Props {
  onBack: () => void
}

export default function CsvImportPage({ onBack }: Props) {
  const [step, setStep] = useState<'setup' | 'review' | 'done'>('setup')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdCount, setCreatedCount] = useState(0)

  const [csvText, setCsvText] = useState('')
  const [accountId, setAccountId] = useState(0)
  const [dateCol, setDateCol] = useState('')
  const [payeeCol, setPayeeCol] = useState('')
  const [amountCol, setAmountCol] = useState('')
  const [memoCol, setMemoCol] = useState('')
  const [categoryCol, setCategoryCol] = useState('')

  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [rowCategoryOverride, setRowCategoryOverride] = useState<Record<number, number>>({})
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    Promise.all([fetchAccounts(), fetchCategories()])
      .then(([accts, cats]) => { setAccounts(accts); setCategories(cats) })
      .catch(err => setError(err.message))
  }, [])

  const runPreview = () => {
    setFormError(null)
    if (!accountId || !dateCol || !payeeCol || !amountCol) {
      setFormError('Account, date column, payee column, and amount column are required'); return
    }
    previewImport({
      csv_text: csvText,
      account_id: accountId,
      date_col: dateCol,
      payee_col: payeeCol,
      amount_col: amountCol,
      memo_col: memoCol || null,
      category_col: categoryCol || null,
    })
      .then(previewRows => {
        setRows(previewRows)
        setSkipped(new Set())
        setRowCategoryOverride({})
        setStep('review')
      })
      .catch(err => setFormError(err.message))
  }

  const resolvedCategoryId = (row: ImportPreviewRow) => rowCategoryOverride[row.row_number] ?? row.category_id

  const effectiveStatus = (row: ImportPreviewRow) => {
    if (row.status === 'error') return 'error'
    if (!resolvedCategoryId(row)) return 'needs_category'
    if (row.status === 'possible_duplicate') return 'possible_duplicate'
    return 'ok'
  }

  const activeRows = rows.filter(r => !skipped.has(r.row_number))
  const canCommit = activeRows.length > 0 && activeRows.every(r => effectiveStatus(r) !== 'error' && resolvedCategoryId(r))

  const commit = () => {
    setFormError(null)
    const toCreate: TransactionCreate[] = activeRows.map(r => ({
      date: r.transaction_date as string,
      payee: r.payee as string,
      memo: r.memo,
      amount: r.amount as number,
      account_id: r.account_id,
      category_id: resolvedCategoryId(r) as number,
    }))
    setCommitting(true)
    commitImport(toCreate)
      .then(res => {
        setCreatedCount(res.created_count)
        setStep('done')
      })
      .catch(err => setFormError(err.message))
      .finally(() => setCommitting(false))
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-accent hover:underline text-sm mb-4 cursor-pointer">
        <ArrowLeft size={14} /> Back
      </button>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Import CSV</h2>

      {formError && (
        <div className="px-3 py-2 mb-3 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-900/20 text-negative text-[13px]">
          {formError}
        </div>
      )}

      {step === 'done' && (
        <Card className="p-3 max-w-md border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-900/20">
          <span className="text-positive">Imported {createdCount} transaction(s).</span>
          <div className="mt-2">
            <Button onClick={onBack}>Back to Dashboard</Button>
          </div>
        </Card>
      )}

      {step === 'setup' && (
        <Card className="p-3 max-w-2xl">
          <div className="mb-2">
            <textarea
              placeholder="Paste CSV text here (with a header row)"
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={8}
              className="w-full font-mono text-xs p-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
          <div className="flex gap-2 flex-wrap mb-2">
            <Select value={accountId} onChange={e => setAccountId(parseInt(e.target.value) || 0)}>
              <option value={0}>Account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Input placeholder="Date column name" value={dateCol} onChange={e => setDateCol(e.target.value)} />
            <Input placeholder="Payee column name" value={payeeCol} onChange={e => setPayeeCol(e.target.value)} />
            <Input placeholder="Amount column name" value={amountCol} onChange={e => setAmountCol(e.target.value)} />
            <Input placeholder="Memo column name (optional)" value={memoCol} onChange={e => setMemoCol(e.target.value)} />
            <Input placeholder="Category column name (optional)" value={categoryCol} onChange={e => setCategoryCol(e.target.value)} />
          </div>
          <Button onClick={runPreview}>Preview</Button>
        </Card>
      )}

      {step === 'review' && (
        <div>
          <div className="mb-3">
            <Table>
              <Thead>
                <Tr>
                  <Th></Th>
                  <Th>Date</Th>
                  <Th>Payee</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Category</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map(r => {
                  const status = effectiveStatus(r)
                  const isSkipped = skipped.has(r.row_number)
                  return (
                    <Tr key={r.row_number} className={isSkipped ? 'opacity-50' : ''}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={!isSkipped}
                          onChange={e => {
                            const next = new Set(skipped)
                            if (e.target.checked) next.delete(r.row_number)
                            else next.add(r.row_number)
                            setSkipped(next)
                          }}
                        />
                      </Td>
                      <Td>{r.transaction_date ?? '—'}</Td>
                      <Td>{r.payee ?? '—'}</Td>
                      <Td className="text-right">{r.amount ?? '—'}</Td>
                      <Td>
                        {status === 'error' ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <Select
                            value={resolvedCategoryId(r) ?? 0}
                            onChange={e => setRowCategoryOverride({ ...rowCategoryOverride, [r.row_number]: parseInt(e.target.value) || 0 })}
                          >
                            <option value={0}>Select category</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        )}
                      </Td>
                      <Td>
                        {status === 'error' && <Badge variant="negative">Error: {r.error_message}</Badge>}
                        {status === 'needs_category' && <Badge variant="negative">Needs category</Badge>}
                        {status === 'possible_duplicate' && <Badge variant="warning">Possible duplicate</Badge>}
                        {status === 'ok' && <Badge variant="positive">OK</Badge>}
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </div>
          <div className="flex gap-2">
            <Button onClick={commit} disabled={!canCommit || committing}>
              {committing ? 'Importing...' : `Commit ${activeRows.length} transaction(s)`}
            </Button>
            <Button variant="secondary" onClick={() => setStep('setup')}>Back</Button>
          </div>
        </div>
      )}
    </div>
  )
}
