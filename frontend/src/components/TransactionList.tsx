import { Transaction, Account } from '../api/client'
import { Table, Thead, Tbody, Tr, Th, Td, Badge } from './ui'
import { formatMoney } from '../utils/currency'

interface Props {
  transactions: Transaction[]
  selectedUserId?: number | null
  accounts?: Account[]
}

export default function TransactionList({ transactions, selectedUserId, accounts = [] }: Props) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const hasMemo = sorted.some(t => t.memo !== null)

  // Not owned by the selected user, but visible because it has a split share for them.
  const sharedShareFor = (t: Transaction): number | null => {
    if (!selectedUserId) return null
    if (accounts.some(a => a.id === t.account_id)) return null
    const mine = t.splits.find(s => s.user_id === selectedUserId)
    return mine ? mine.share_amount : null
  }

  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Date</Th>
          <Th>Payee</Th>
          <Th>Category</Th>
          <Th>Account</Th>
          {hasMemo && <Th>Memo</Th>}
          <Th className="text-right">Amount</Th>
        </Tr>
      </Thead>
      <Tbody>
        {sorted.map(t => (
          <Tr key={t.id}>
            <Td>{t.date}</Td>
            <Td>{t.payee}</Td>
            <Td>{t.category_name}</Td>
            <Td>{t.account_name}</Td>
            {hasMemo && <Td>{t.memo ?? ''}</Td>}
            <Td className={`text-right ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatMoney(t.amount, t.currency)}
              {sharedShareFor(t) !== null && (
                <div className="mt-0.5">
                  <Badge variant="info">Shared · your share: {formatMoney(sharedShareFor(t)!, t.currency)}</Badge>
                </div>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
