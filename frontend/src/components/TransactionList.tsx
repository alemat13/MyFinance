import { Transaction, Account } from '../api/client'
import { Table, Thead, Tbody, Tr, Th, Td, Badge, CategoryBadge } from './ui'
import { formatMoney } from '../utils/currency'
import { sharedShareFor } from '../utils/transactions'

interface Props {
  transactions: Transaction[]
  selectedUserId?: number | null
  accounts?: Account[]
}

export default function TransactionList({ transactions, selectedUserId, accounts = [] }: Props) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const hasMemo = sorted.some(t => t.memo !== null)

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
            <Td><CategoryBadge name={t.category_name} color={t.category_color} icon={t.category_icon} /></Td>
            <Td>{t.account_name}</Td>
            {hasMemo && <Td>{t.memo ?? ''}</Td>}
            <Td className={`text-right ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatMoney(t.amount, t.currency)}
              {sharedShareFor(t, selectedUserId, accounts) !== null && (
                <div className="mt-0.5">
                  <Badge variant="info">Shared · your share: {formatMoney(sharedShareFor(t, selectedUserId, accounts)!, t.currency)}</Badge>
                </div>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}
