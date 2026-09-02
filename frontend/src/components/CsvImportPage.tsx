import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Account, Category, ImportDetectResponse, ImportPreviewRow, TransactionCreate,
  fetchAccounts, fetchCategories, detectImport, previewImport, commitImport,
} from '../api/client'
import { Button, Input, Select, Card, Table, Thead, Tbody, Tr, Th, Td, Badge, StatusMessage } from './ui'

interface Props {
  onBack: () => void
  selectedUserId: number | null
}

const DATE_FORMATS = ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%d.%m.%Y', '%Y/%m/%d']

export default function CsvImportPage({ onBack, selectedUserId }: Props) {
  const [step, setStep] = useState<'setup' | 'confirm' | 'review' | 'done'>('setup')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdCount, setCreatedCount] = useState(0)

  const [file, setFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState(0)
  const [detecting, setDetecting] = useState(false)

  const [detected, setDetected] = useState<ImportDetectResponse | null>(null)
  const [encoding, setEncoding] = useState('')
  const [delimiter, setDelimiter] = useState('')
  const [dateFormat, setDateFormat] = useState('')
  const [decimalSeparator, setDecimalSeparator] = useState('.')
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

  const runDetect = () => {
    setFormError(null)
    if (!file || !accountId) {
      setFormError('A file and an account are required'); return
    }
    setDetecting(true)
    detectImport(file)
      .then(result => {
        setDetected(result)
        setEncoding(result.encoding)
        setDelimiter(result.delimiter)
        setDateFormat(result.date_format ?? '')
        setDecimalSeparator(result.decimal_separator)
        setDateCol(result.column_mapping.date ?? '')
        setPayeeCol(result.column_mapping.payee ?? '')
        setAmountCol(result.column_mapping.amount ?? '')
        setMemoCol(result.column_mapping.memo ?? '')
        setCategoryCol(result.column_mapping.category ?? '')
        setStep('confirm')
      })
      .catch(err => setFormError(err.message))
      .finally(() => setDetecting(false))
  }

  const runPreview = () => {
    setFormError(null)
    if (!file || !dateCol || !payeeCol || !amountCol || !dateFormat) {
      setFormError('Date column, payee column, amount column, and date format are required'); return
    }
    previewImport(file, {
      account_id: accountId,
      encoding,
      delimiter,
      date_format: dateFormat,
      decimal_separator: decimalSeparator,
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
  const canCommit = activeRows.length > 0 && activeRows.every(r => effectiveStatus(r) !== 'error')

  const commit = () => {
    setFormError(null)
    const toCreate: TransactionCreate[] = activeRows.map(r => ({
      date: r.transaction_date as string,
      payee: r.payee as string,
      memo: r.memo,
      amount: r.amount as number,
      account_id: r.account_id,
      category_id: resolvedCategoryId(r) ?? null,
    }))
    setCommitting(true)
    commitImport(toCreate, selectedUserId)
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
        <Card className="p-3 max-w-md">
          <div className="flex gap-2 flex-wrap items-end mb-2">
            <Input
              type="file"
              accept=".csv"
              aria-label="CSV file"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            <Select value={accountId} onChange={e => setAccountId(parseInt(e.target.value) || 0)}>
              <option value={0}>Account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <Button onClick={runDetect} disabled={!file || !accountId || detecting}>
            {detecting ? 'Analyzing...' : 'Analyze file'}
          </Button>
        </Card>
      )}

      {step === 'confirm' && detected && (
        <Card className="p-3 max-w-2xl">
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-3">
            Detected settings — review and adjust before previewing.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Encoding
              <Select value={encoding} onChange={e => setEncoding(e.target.value)}>
                {[encoding, 'utf-8-sig', 'utf-8', 'cp1252', 'latin-1']
                  .filter((v, i, arr) => v && arr.indexOf(v) === i)
                  .map(v => <option key={v} value={v}>{v}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Delimiter
              <Select value={delimiter} onChange={e => setDelimiter(e.target.value)}>
                {[delimiter, ',', ';', '\t'].filter((v, i, arr) => v && arr.indexOf(v) === i).map(v => (
                  <option key={v} value={v}>{v === '\t' ? 'Tab' : v}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Date format
              <Select value={dateFormat} onChange={e => setDateFormat(e.target.value)}>
                <option value="">Select date format</option>
                {DATE_FORMATS.map(v => <option key={v} value={v}>{v}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Decimal separator
              <Select value={decimalSeparator} onChange={e => setDecimalSeparator(e.target.value)}>
                <option value=".">. (1234.50)</option>
                <option value=",">, (1234,50)</option>
              </Select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Date column
              <Select value={dateCol} onChange={e => setDateCol(e.target.value)}>
                <option value="">Select column</option>
                {detected.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Payee column
              <Select value={payeeCol} onChange={e => setPayeeCol(e.target.value)}>
                <option value="">Select column</option>
                {detected.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Amount column
              <Select value={amountCol} onChange={e => setAmountCol(e.target.value)}>
                <option value="">Select column</option>
                {detected.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Memo column (optional)
              <Select value={memoCol} onChange={e => setMemoCol(e.target.value)}>
                <option value="">None</option>
                {detected.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
              Category column (optional)
              <Select value={categoryCol} onChange={e => setCategoryCol(e.target.value)}>
                <option value="">None</option>
                {detected.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </Select>
            </label>
          </div>

          {detected.sample_rows.length > 0 && (
            <div className="mb-3 overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    {detected.headers.map(h => <Th key={h}>{h}</Th>)}
                  </Tr>
                </Thead>
                <Tbody>
                  {detected.sample_rows.slice(0, 3).map((row, i) => (
                    <Tr key={i}>
                      {detected.headers.map(h => <Td key={h}>{row[h] ?? ''}</Td>)}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={runPreview} disabled={!dateCol || !payeeCol || !amountCol || !dateFormat}>
              Preview
            </Button>
            <Button variant="secondary" onClick={() => setStep('setup')}>Back</Button>
          </div>
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
            <Button variant="secondary" onClick={() => setStep('confirm')}>Back</Button>
          </div>
        </div>
      )}
    </div>
  )
}
