import { useState } from 'react'
import {
  TransactionSearchRequest,
  bulkDeleteTransactions, bulkDeleteTransactionsByFilter,
} from '../api/client'
import { useToast } from '../context/ToastContext'
import { Modal, Button } from './ui'

interface Props {
  transactionIds: number[]
  selectedUserId: number | null
  onClose: () => void
  onDeleted: () => void
  /** Same "extend to every row the filter matches" offer as BulkEditModal:
   * passed only when the whole page is ticked. */
  searchFilter?: TransactionSearchRequest
  matchingTotal?: number
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

// Admin mode only (TransactionsPage shows "Delete selected" behind it).
export default function BulkDeleteModal({
  transactionIds, selectedUserId, onClose, onDeleted, searchFilter, matchingTotal,
}: Props) {
  const canSelectAllMatching = searchFilter != null && matchingTotal != null && matchingTotal > transactionIds.length
  const [allMatching, setAllMatching] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()
  const targetCount = allMatching && matchingTotal != null ? matchingTotal : transactionIds.length

  const handleDelete = () => {
    setDeleting(true)
    const call = allMatching && searchFilter && matchingTotal != null
      ? bulkDeleteTransactionsByFilter(searchFilter, matchingTotal, selectedUserId)
      : bulkDeleteTransactions(transactionIds, selectedUserId)
    call
      .then(res => {
        showToast(`${res.deleted_count} transaction(s) deleted`, 'success')
        onDeleted()
      })
      .catch(err => showToast(err.message))
      .finally(() => setDeleting(false))
  }

  return (
    <Modal isOpen onClose={onClose} title="Delete transactions">
      <div className="flex flex-col gap-3">
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
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This cannot be undone. Their history is kept, but the transactions and their splits are gone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            Delete {formatCount(targetCount)} transaction{targetCount === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
