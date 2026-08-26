import { useEffect, useState } from 'react'
import {
  Account, Category, ImportPreviewRow, TransactionCreate,
  fetchAccounts, fetchCategories, previewImport, commitImport,
} from '../api/client'

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
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  return (
    <div>
      <button onClick={onBack} style={backBtnStyle}>
        ← Back to Dashboard
      </button>
      <h2 style={{ margin: '0 0 12px 0' }}>Import CSV</h2>

      {formError && (
        <div style={{ padding: '8px 12px', marginBottom: '12px', border: '1px solid #f5c2c7', borderRadius: '4px', background: '#f8d7da', color: '#842029', fontSize: '13px' }}>
          {formError}
        </div>
      )}

      {step === 'done' && (
        <div style={{ padding: '12px', border: '1px solid #badbcc', borderRadius: '6px', background: '#d1e7dd', color: '#0f5132', maxWidth: '400px' }}>
          Imported {createdCount} transaction(s).
          <div style={{ marginTop: '8px' }}>
            <button onClick={onBack} style={saveBtnStyle}>Back to Dashboard</button>
          </div>
        </div>
      )}

      {step === 'setup' && (
        <div style={{ padding: '12px', border: '1px solid #ccc', borderRadius: '6px', background: '#f9f9f9', maxWidth: '600px' }}>
          <div style={{ marginBottom: '8px' }}>
            <textarea
              placeholder="Paste CSV text here (with a header row)"
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={8}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', padding: '8px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <select value={accountId} onChange={e => setAccountId(parseInt(e.target.value) || 0)} style={inputStyle}>
              <option value={0}>Account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input placeholder="Date column name" value={dateCol} onChange={e => setDateCol(e.target.value)} style={inputStyle} />
            <input placeholder="Payee column name" value={payeeCol} onChange={e => setPayeeCol(e.target.value)} style={inputStyle} />
            <input placeholder="Amount column name" value={amountCol} onChange={e => setAmountCol(e.target.value)} style={inputStyle} />
            <input placeholder="Memo column name (optional)" value={memoCol} onChange={e => setMemoCol(e.target.value)} style={inputStyle} />
            <input placeholder="Category column name (optional)" value={categoryCol} onChange={e => setCategoryCol(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={runPreview} style={saveBtnStyle}>Preview</button>
        </div>
      )}

      {step === 'review' && (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: '12px' }}>
            <thead>
              <tr style={{ background: '#eee', textAlign: 'left' }}>
                <th style={thStyle}></th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Payee</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const status = effectiveStatus(r)
                const isSkipped = skipped.has(r.row_number)
                return (
                  <tr key={r.row_number} style={{ borderBottom: '1px solid #ddd', opacity: isSkipped ? 0.5 : 1 }}>
                    <td style={tdStyle}>
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
                    </td>
                    <td style={tdStyle}>{r.transaction_date ?? '—'}</td>
                    <td style={tdStyle}>{r.payee ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.amount ?? '—'}</td>
                    <td style={tdStyle}>
                      {status === 'error' ? (
                        <span style={{ color: '#999' }}>—</span>
                      ) : (
                        <select
                          value={resolvedCategoryId(r) ?? 0}
                          onChange={e => setRowCategoryOverride({ ...rowCategoryOverride, [r.row_number]: parseInt(e.target.value) || 0 })}
                          style={inputStyle}
                        >
                          <option value={0}>Select category</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>
                      {status === 'error' && <span style={{ color: '#dc3545' }}>Error: {r.error_message}</span>}
                      {status === 'needs_category' && <span style={{ color: '#dc3545' }}>Needs category</span>}
                      {status === 'possible_duplicate' && <span style={{ color: '#ffc107' }}>Possible duplicate</span>}
                      {status === 'ok' && <span style={{ color: '#28a745' }}>OK</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={commit} disabled={!canCommit || committing} style={saveBtnStyle}>
              {committing ? 'Importing...' : `Commit ${activeRows.length} transaction(s)`}
            </button>
            <button onClick={() => setStep('setup')} style={cancelBtnStyle}>Back</button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px',
}

const btnBase: React.CSSProperties = {
  border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
}

const saveBtnStyle: React.CSSProperties = {
  ...btnBase, background: '#28a745', color: '#fff',
}

const cancelBtnStyle: React.CSSProperties = {
  ...btnBase, background: '#6c757d', color: '#fff',
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#0066cc', cursor: 'pointer', fontSize: '14px', marginBottom: '16px', padding: 0,
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '2px solid #ccc',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
}
