import { useEffect, useState } from 'react'
import { Tag, createTag, deleteTag, fetchTags, updateTag } from '../api/client'
import TagChips from './TagChips'
import { BackButton, Button, Card, ColorPicker, ConfirmDialog, Input, StatusMessage } from './ui'
import { useToast } from '../context/ToastContext'

interface Props {
  onBack: () => void
  selectedUserId: number | null
  // "See transactions": the Transactions screen filtered on that tag.
  onOpenTransactions: (tagId: number) => void
}

/** The household's tags: create, rename, recolour, delete. Which transactions
 *  carry a tag is set on the transactions themselves. */
export default function TagsPage({ onBack, selectedUserId, onOpenTransactions }: Props) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<Tag | null>(null)
  const { showToast } = useToast()

  const load = () => fetchTags().then(setTags).catch(err => setError(err.message)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const add = () => {
    if (!newName.trim()) return
    createTag({ name: newName.trim() })
      .then(() => { setNewName(''); load() })
      .catch(err => showToast(err.message))
  }

  const rename = (tag: Tag) => {
    if (!editName.trim() || editName.trim() === tag.name) { setEditingId(null); return }
    updateTag(tag.id, { name: editName.trim() })
      .then(() => { setEditingId(null); load() })
      .catch(err => showToast(err.message))
  }

  const recolor = (tag: Tag, color: string | null) =>
    updateTag(tag.id, { color }).then(load).catch(err => showToast(err.message))

  const confirmDelete = () => {
    if (!deleting) return
    deleteTag(deleting.id, selectedUserId)
      .then(() => { setDeleting(null); load() })
      .catch(err => showToast(err.message))
  }

  if (error) return <StatusMessage error={error} />

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Tags</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
        Free labels on transactions (a trip, a project, a refund to chase). A transaction can carry several. They don't
        change balances or charts: they are there to find transactions again, from the Tag filter on Transactions.
      </p>

      <form className="flex gap-2 mb-4" onSubmit={e => { e.preventDefault(); add() }}>
        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New tag" aria-label="New tag"
               className="max-w-xs" />
        <Button type="submit" disabled={!newName.trim()}>Add</Button>
      </form>

      <StatusMessage loading={loading} />
      {!loading && tags.length === 0 && (
        <Card className="p-3 text-sm text-slate-500 dark:text-slate-400">No tag yet.</Card>
      )}

      <div className="space-y-2">
        {tags.map(tag => (
          <Card key={tag.id} className="p-3 flex items-center gap-2 flex-wrap">
            <ColorPicker value={tag.color ?? null} onChange={color => recolor(tag, color)} />
            {editingId === tag.id ? (
              <form className="flex gap-2 flex-1 min-w-[180px]" onSubmit={e => { e.preventDefault(); rename(tag) }}>
                <Input value={editName} onChange={e => setEditName(e.target.value)} aria-label={`Rename ${tag.name}`}
                       autoFocus className="flex-1" />
                <Button type="submit" size="sm">Save</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
              </form>
            ) : (
              <>
                <span className="flex-1 min-w-[120px]"><TagChips tags={[tag]} /></span>
                <button
                  type="button"
                  onClick={() => onOpenTransactions(tag.id)}
                  className="text-sm text-accent hover:underline cursor-pointer"
                >
                  {tag.transaction_count} transaction{tag.transaction_count === 1 ? '' : 's'}
                </button>
                <Button size="sm" variant="secondary" onClick={() => { setEditingId(tag.id); setEditName(tag.name) }}>
                  Rename
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(tag)}>Delete</Button>
              </>
            )}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        isOpen={deleting !== null}
        title={`Delete the tag “${deleting?.name ?? ''}”?`}
        message={deleting && deleting.transaction_count > 0
          ? `It is removed from the ${deleting.transaction_count} transaction${deleting.transaction_count === 1 ? '' : 's'} carrying it (noted in each one's history). The transactions themselves stay.`
          : 'No transaction carries it.'}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
