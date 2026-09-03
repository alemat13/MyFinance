import { useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'

interface UseCrudListConfig<T, TCreate, TUpdate> {
  fetchAll: () => Promise<T[]>
  create: (data: TCreate) => Promise<T>
  update: (id: number, data: TUpdate) => Promise<T>
  remove: (id: number) => Promise<void>
  getId: (item: T) => number
  emptyForm: TCreate
  toEditData: (item: T) => TUpdate
  validate?: (data: TCreate | TUpdate) => string | null
  /** Extra reload dependencies beyond mount, e.g. [selectedUserId]. */
  deps?: unknown[]
}

/**
 * Shared state/handlers for the "list + inline new/edit form + delete confirm"
 * pattern used by AccountsList/CategoriesList/UsersList. Table/form JSX and any
 * per-entity divergence (hierarchy logic, extra parallel state, multi-step saves)
 * stay in the calling component.
 */
export function useCrudList<T, TCreate, TUpdate>(config: UseCrudListConfig<T, TCreate, TUpdate>) {
  const { fetchAll, create, update, remove, getId, emptyForm, toEditData, validate, deps = [] } = config

  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<TUpdate>({} as TUpdate)
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<TCreate>(emptyForm)
  const [deletingItem, setDeletingItem] = useState<T | null>(null)
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    fetchAll()
      .then(setItems)
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, deps)

  const startEdit = (item: T) => {
    setEditingId(getId(item))
    setEditData(toEditData(item))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({} as TUpdate)
  }

  const saveEdit = (id: number) => {
    const err = validate?.(editData)
    if (err) { showToast(err); return }
    update(id, editData)
      .then(() => { cancelEdit(); load() })
      .catch(err => showToast(err.message))
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewData(emptyForm)
  }

  const saveNew = () => {
    const err = validate?.(newData)
    if (err) { showToast(err); return }
    create(newData)
      .then(() => { cancelNew(); load() })
      .catch(err => showToast(err.message))
  }

  const confirmDelete = () => {
    if (!deletingItem) return
    remove(getId(deletingItem))
      .then(() => load())
      .catch(err => showToast(err.message))
      .finally(() => setDeletingItem(null))
  }

  return {
    items, loading, error, load,
    editingId, editData, setEditData, startEdit, cancelEdit, saveEdit,
    showNew, setShowNew, newData, setNewData, saveNew, cancelNew,
    deletingItem, setDeletingItem, confirmDelete,
  }
}
