import { Fragment } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { CategoryBadge, IconButton, Table, Thead, Tbody, Tr, Th, Td } from '../ui'
import TagChips from '../TagChips'
import { formatMoney } from '../../utils/currency'
import { myShareFor, balanceFor, formatDateGroupHeader } from '../../utils/transactions'
import { CheckpointIcon, CheckpointPeriod, LinkedIcon, TransactionRowsProps, splitsDisplay } from './rowParts'

interface Props extends TransactionRowsProps {
  allSelected: boolean
  onToggleSelectAll: () => void
}

/** The Transactions screen's list from `md` up: a table. */
export default function TransactionTable({
  transactions, groupByDate, selectedUserId, allAccounts, selectedIds,
  onToggleSelected, onToggleReconciled, onOpen, sumByCurrency, allSelected, onToggleSelectAll,
}: Props) {
  const showMyColumns = selectedUserId != null
  const columnCount = showMyColumns ? 8 : 6
  return (
    <Table>
      <Thead>
        <Tr>
          <Th className="w-8">
            <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} aria-label="Select all on this page" />
          </Th>
          <Th>Payee</Th>
          <Th>Category</Th>
          <Th>Account</Th>
          <Th className="text-right">Amount</Th>
          {showMyColumns && <Th className="text-right">My share</Th>}
          {showMyColumns && <Th className="text-right">Balance</Th>}
          <Th>Split</Th>
        </Tr>
      </Thead>
      <Tbody>
        {transactions.length === 0 && (
          <Tr><Td colSpan={columnCount} className="text-center py-5 text-slate-400">No transactions match your filters</Td></Tr>
        )}
        {transactions.map((t, idx) => {
          const showDateHeader = groupByDate && (idx === 0 || transactions[idx - 1].date !== t.date)
          return (
          <Fragment key={t.id}>
          {showDateHeader && (
            <Tr className="hover:bg-transparent bg-slate-100 dark:bg-slate-800/70">
              <Td colSpan={columnCount} className="py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {formatDateGroupHeader(t.date)}
              </Td>
            </Tr>
          )}
          <Tr
            onClick={() => onOpen(t.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id) } }}
            role="button"
            tabIndex={0}
            className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${t.reconciled ? 'opacity-60' : ''}`}
          >
            <Td onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedIds.has(t.id)}
                onChange={() => onToggleSelected(t.id)}
                aria-label={`Select transaction ${t.payee}`}
              />
            </Td>
            <Td>
              <span className="inline-flex items-center gap-1.5">
                <IconButton
                  aria-label={t.reconciled ? `Mark ${t.payee} as unreconciled` : `Mark ${t.payee} as reconciled`}
                  onClick={e => { e.stopPropagation(); onToggleReconciled(t) }}
                  className="p-0.5"
                >
                  {t.reconciled
                    ? <CheckCircle2 size={16} className="text-positive" />
                    : <Circle size={16} className="text-slate-300 dark:text-slate-600" />}
                </IconButton>
                {t.payee}
                {t.link_id != null && <LinkedIcon />}{t.checkpoint_value != null && <CheckpointIcon since={t.checkpoint_since} />}
              </span>
              {t.checkpoint_value != null && <CheckpointPeriod since={t.checkpoint_since} className="ml-7 mt-0.5" />}
              {t.tags && t.tags.length > 0 && <div className="ml-7 mt-0.5"><TagChips tags={t.tags} /></div>}
            </Td>
            <Td><CategoryBadge name={t.category_name} color={t.category_color} icon={t.category_icon} /></Td>
            <Td>{t.account_name}</Td>
            <Td className={`text-right ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatMoney(t.amount, t.currency)}
            </Td>
            {showMyColumns && (() => {
              const myShare = myShareFor(t, selectedUserId!)
              const balance = balanceFor(t, selectedUserId!, allAccounts)
              return (
                <>
                  <Td className={`text-right ${myShare >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatMoney(myShare, t.currency)}
                  </Td>
                  <Td className={`text-right ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatMoney(balance, t.currency)}
                  </Td>
                </>
              )
            })()}
            <Td className="text-xs">{splitsDisplay(t.splits, t.currency)}</Td>
          </Tr>
          </Fragment>
          )
        })}
        {transactions.length > 0 && (
          <Tr className="hover:bg-transparent font-semibold border-t-2 border-slate-300 dark:border-slate-600">
            <Td colSpan={4}>Total</Td>
            <Td className="text-right">{sumByCurrency(t => t.amount)}</Td>
            {showMyColumns && (
              <>
                <Td className="text-right">{sumByCurrency(t => myShareFor(t, selectedUserId!))}</Td>
                <Td className="text-right">{sumByCurrency(t => balanceFor(t, selectedUserId!, allAccounts))}</Td>
              </>
            )}
            <Td />
          </Tr>
        )}
      </Tbody>
    </Table>
  )
}
