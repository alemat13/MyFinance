import { Account, Category, GlobalSplitWeight, SplitSource, User } from '../api/client'
import SplitEditor, { SplitRow } from './SplitEditor'
import { Button } from './ui'
import { prorateWeights } from '../utils/splitWeights'

interface Props {
  rows: SplitRow[]
  onChange: (rows: SplitRow[]) => void
  amount: number
  currency: string
  allUsers: User[]
  account: Account | null
  category: Category | null
  globalWeights: GlobalSplitWeight[]
  source: SplitSource | null
  onSourceChange: (source: SplitSource) => void
}

export default function TransactionSplitFields({
  rows, onChange, amount, currency, allUsers, account, category, globalWeights, source, onSourceChange,
}: Props) {
  const positiveGlobal = globalWeights.filter(w => w.weight > 0)

  const applyTier = (tierRows: SplitRow[], tierSource: SplitSource) => {
    onChange(tierRows)
    onSourceChange(tierSource)
  }

  const shareByUser = new Map(prorateWeights(amount, rows.map(r => ({ user_id: r.user_id, weight: r.value }))).map(s => [s.user_id, s.share_amount]))

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5 items-center mb-1">
        <span className="text-xs text-slate-600 dark:text-slate-300 mr-1">Quick fill:</span>
        <Button
          size="sm"
          variant={source === 'global' ? 'primary' : 'secondary'}
          disabled={positiveGlobal.length === 0}
          onClick={() => applyTier(positiveGlobal.map(w => ({ user_id: w.user_id, value: w.weight })), 'global')}
        >
          Global
        </Button>
        <Button
          size="sm"
          variant={source === 'account' ? 'primary' : 'secondary'}
          disabled={!account || account.split_weights.length === 0}
          onClick={() => account && applyTier(account.split_weights.map(w => ({ user_id: w.user_id, value: w.weight })), 'account')}
        >
          Account
        </Button>
        <Button
          size="sm"
          variant={source === 'category' ? 'primary' : 'secondary'}
          disabled={!category || category.splits.length === 0}
          onClick={() => category && applyTier(category.splits.map(s => ({ user_id: s.user_id, value: s.weight })), 'category')}
        >
          Category
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={allUsers.length === 0}
          onClick={() => applyTier(allUsers.map(u => ({ user_id: u.id, value: 1 })), 'custom')}
        >
          Split Evenly
        </Button>
        {allUsers.map(u => (
          <Button
            key={u.id}
            size="sm"
            variant="secondary"
            onClick={() => applyTier([{ user_id: u.id, value: 1 }], 'custom')}
          >
            {u.name}
          </Button>
        ))}
      </div>
      <SplitEditor
        rows={rows}
        allUsers={allUsers}
        unit="weight"
        currency={currency}
        label="Split"
        onChange={r => { onChange(r); onSourceChange('custom') }}
        computeShare={row => shareByUser.get(row.user_id) ?? 0}
      />
    </div>
  )
}
