import { DragEvent, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  SavedFilter, SavedFilterInput,
  createSavedFilter, deleteSavedFilter, fetchSavedFilters, reorderSavedFilters, updateSavedFilter,
} from '../api/client'
import { Button, ConfirmDialog, IconButton, Input, Modal } from './ui'
import { useToast } from '../context/ToastContext'
import { useIsMobile } from '../hooks/useMediaQuery'
import { cn } from '../lib/utils'

/** The filter on screen, in the shape it is saved in; `filters` null when
 *  there is nothing set to save. */
export type CurrentFilter = Omit<SavedFilterInput, 'name'> | null

interface Props {
  current: CurrentFilter
  onApply: (filter: SavedFilter) => void
}

// Key order is fixed by how the page builds its state, but a saved filter
// comes back from the server as JSON, so compare on sorted keys.
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]]))
    : v)

export const sameFilter = (saved: Omit<SavedFilterInput, 'name'>, current: CurrentFilter) =>
  current !== null && saved.mode === current.mode && canonical(saved.filters) === canonical(current.filters)

/** The saved filters as buttons (next to Simple/Advanced), a "Save filter"
 *  button, and their rename/delete dialogs. Reordered by drag and drop on
 *  desktop. */
export default function SavedFilters({ current, onApply }: Props) {
  const [saved, setSaved] = useState<SavedFilter[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [renaming, setRenaming] = useState<SavedFilter | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleting, setDeleting] = useState<SavedFilter | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const isMobile = useIsMobile()

  useEffect(() => {
    fetchSavedFilters().then(setSaved).catch(err => showToast(err.message))
  }, [])

  const active = saved.find(f => sameFilter(f, current)) ?? null
  // Saving under an existing name replaces that filter rather than adding a twin.
  const nameTaken = saved.find(f => f.name.trim().toLowerCase() === saveName.trim().toLowerCase()) ?? null

  const openSave = () => { setSaveName(''); setSaveOpen(true) }

  const submitSave = () => {
    if (!current || !saveName.trim()) return
    setBusy(true)
    const call = nameTaken
      ? updateSavedFilter(nameTaken.id, { mode: current.mode, filters: current.filters } as Partial<SavedFilterInput>)
          .then(updated => setSaved(list => list.map(f => (f.id === updated.id ? updated : f))))
      : createSavedFilter({ ...current, name: saveName.trim() } as SavedFilterInput)
          .then(created => setSaved(list => [...list, created]))
    call
      .then(() => { setSaveOpen(false); showToast(`Filter "${saveName.trim()}" saved`, 'success') })
      .catch(err => showToast(err.message))
      .finally(() => setBusy(false))
  }

  const submitRename = () => {
    if (!renaming || !renameName.trim()) return
    setBusy(true)
    updateSavedFilter(renaming.id, { name: renameName.trim() })
      .then(updated => { setSaved(list => list.map(f => (f.id === updated.id ? updated : f))); setRenaming(null) })
      .catch(err => showToast(err.message))
      .finally(() => setBusy(false))
  }

  const confirmDelete = () => {
    if (!deleting) return
    const id = deleting.id
    setDeleting(null)
    deleteSavedFilter(id)
      .then(() => setSaved(list => list.filter(f => f.id !== id)))
      .catch(err => showToast(err.message))
  }

  // Shown in the new order straight away; the server's answer replaces it,
  // and a failure reloads the list as it really is.
  const moveTo = (targetId: number) => {
    if (dragId === null || dragId === targetId) return
    const from = saved.findIndex(f => f.id === dragId)
    const to = saved.findIndex(f => f.id === targetId)
    const next = [...saved]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setSaved(next)
    reorderSavedFilters(next.map(f => f.id))
      .then(setSaved)
      .catch(err => {
        showToast(err.message)
        fetchSavedFilters().then(setSaved).catch(() => {})
      })
  }

  const dragProps = (f: SavedFilter) => isMobile ? {} : {
    draggable: true,
    onDragStart: (e: DragEvent) => { setDragId(f.id); e.dataTransfer?.setData('text/plain', String(f.id)) },
    onDragOver: (e: DragEvent) => { if (dragId !== null) e.preventDefault() },
    onDrop: (e: DragEvent) => { e.preventDefault(); moveTo(f.id); setDragId(null) },
    onDragEnd: () => setDragId(null),
  }

  return (
    <>
      {saved.map(f => (
        <span key={f.id} className={cn('inline-flex items-center', dragId === f.id && 'opacity-50')} {...dragProps(f)}>
          <Button
            size="sm"
            variant={active?.id === f.id ? 'primary' : 'secondary'}
            className={cn(active?.id === f.id && 'ring-2 ring-accent/40', !isMobile && 'cursor-grab')}
            onClick={() => onApply(f)}
            title={isMobile ? undefined : 'Apply this filter (drag to reorder)'}
          >
            {f.name}
          </Button>
          {active?.id === f.id && (
            <>
              <IconButton aria-label={`Rename ${f.name}`} className="p-1"
                          onClick={() => { setRenaming(f); setRenameName(f.name) }}>
                <Pencil size={14} />
              </IconButton>
              <IconButton aria-label={`Delete ${f.name}`} className="p-1" onClick={() => setDeleting(f)}>
                <Trash2 size={14} />
              </IconButton>
            </>
          )}
        </span>
      ))}
      <Button size="sm" variant="ghost" disabled={!current || active !== null}
              title={!current ? 'Set a filter first' : active ? 'This filter is already saved' : 'Save the current filter'}
              onClick={openSave}>
        Save filter
      </Button>

      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title="Save filter">
        <form onSubmit={e => { e.preventDefault(); submitSave() }}>
          <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200" htmlFor="saved-filter-name">Name</label>
          <Input id="saved-filter-name" autoFocus maxLength={100} value={saveName}
                 onChange={e => setSaveName(e.target.value)} className="w-full" />
          {nameTaken && (
            <p className="text-xs mt-2 text-slate-500 dark:text-slate-400">
              A filter named "{nameTaken.name}" already exists; saving replaces it.
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !saveName.trim()}>{nameTaken ? 'Replace' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={renaming !== null} onClose={() => setRenaming(null)} title="Rename filter">
        <form onSubmit={e => { e.preventDefault(); submitRename() }}>
          <Input aria-label="New name" autoFocus maxLength={100} value={renameName}
                 onChange={e => setRenameName(e.target.value)} className="w-full" />
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" disabled={busy || !renameName.trim()}>Rename</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete filter"
        message={`Delete the saved filter "${deleting?.name ?? ''}"? Transactions are not affected.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
