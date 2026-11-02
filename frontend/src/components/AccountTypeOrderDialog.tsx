import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { setAccountTypeOrder } from '../api/client'
import { useToast } from '../context/ToastContext'
import { AccountTypeGroup } from '../utils/accountGroups'
import { Button, IconButton, Modal } from './ui'

interface Props {
  isOpen: boolean
  /** Every type group, in the order currently shown. */
  groups: AccountTypeGroup[]
  onClose: () => void
  onSaved: () => void
}

/** Lets the user arrange the account type groups (Checking, Savings…) with up and
 *  down arrows. The order is saved for the whole household and applies wherever
 *  accounts are grouped by type: this screen, the account picker, net worth. */
export default function AccountTypeOrderDialog({ isOpen, groups, onClose, onSaved }: Props) {
  const [order, setOrder] = useState<AccountTypeGroup[]>(groups)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (isOpen) setOrder(groups)
  }, [isOpen, groups])

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= order.length) return
    const next = [...order]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setOrder(next)
  }

  const save = () => {
    setSaving(true)
    setAccountTypeOrder(order.map(g => g.key))
      .then(() => { onSaved(); onClose() })
      .catch(err => showToast(err.message))
      .finally(() => setSaving(false))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reorder account types">
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Groups show in this order everywhere accounts are grouped by type.
      </p>
      <ol className="flex flex-col gap-1.5" aria-label="Account types">
        {order.map((g, i) => (
          <li
            key={g.key}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5"
          >
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-xs text-slate-400 w-4 text-right">{i + 1}</span>
              <span className="truncate font-medium text-slate-800 dark:text-slate-100">{g.label}</span>
              <span className="text-xs text-slate-400">{g.accounts.length}</span>
            </span>
            <span className="flex shrink-0">
              <IconButton aria-label={`Move ${g.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={16} />
              </IconButton>
              <IconButton aria-label={`Move ${g.label} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={16} />
              </IconButton>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>Save order</Button>
      </div>
    </Modal>
  )
}
