import { Transaction, Account } from '../api/client'
import { Table, Thead, Tbody, Tr, Th, Td, Badge, CategoryBadge, Card } from './ui'
import { formatMoney } from '../utils/currency'
import { sharedShareFor } from '../utils/transactions'
import { useIsMobile } from '../hooks/useMediaQuery'

interface Props {
  transactions: Transaction[]
  selectedUserId?: number | null
  accounts?: Account[]
}

export default function TransactionList({ transactions, selectedUserId, accounts = [] }: Props) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const hasMemo = sorted.some(t => t.memo !== null)
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="space-y-2">
        {sorted.map(t => {
          const sharedShare = sharedShareFor(t, selectedUserId, accounts)
          return (
            <Card key={t.id} className="p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{t.payee}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t.date}</div>
                </div>
                <div className={`shrink-0 font-semibold ${t.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatMoney(t.amount, t.currency)}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <CategoryBadge name={t.category_name} color={t.category_color} icon={t.category_icon} />
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{t.account_name}</span>
              </div>
              {t.memo && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{t.memo}</div>
              )}
              {sharedShare !== null && (
                <div className="mt-1.5">
                  <Badge variant="info">Shared · your share: {formatMoney(sharedShare, t.currency)}</Badge>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    )
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
