import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  Category, CategoryCreate, CategoryUpdate, CategorySplitCreate,
  User, fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchUsers,
} from '../api/client'
import SplitEditor, { SplitRow } from './SplitEditor'
import { useToast } from '../context/ToastContext'
import {
  Button, Input, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, ConfirmDialog,
  CategoryBadge, IconPicker, ColorPicker,
} from './ui'

interface Props {
  onBack: () => void
}

const emptyForm: CategoryCreate = { name: '', type: '', color: null, icon: null, splits: [] }

const toRows = (splits: CategorySplitCreate[]): SplitRow[] =>
  splits.map(s => ({ user_id: s.user_id, value: s.weight }))

const fromRows = (rows: SplitRow[]): CategorySplitCreate[] =>
  rows.map(r => ({ user_id: r.user_id, weight: r.value }))

const validateSplitWeights = (splits: CategorySplitCreate[]): string | null => {
  if (splits.length === 0) return null
  if (splits.some(s => s.weight < 0)) return 'Split weights must be >= 0'
  if (splits.every(s => s.weight === 0)) return 'At least one split weight must be greater than 0'
  return null
}

export default function CategoriesList({ onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<CategoryUpdate>({})
  const [showNew, setShowNew] = useState(false)
  const [newData, setNewData] = useState<CategoryCreate>(emptyForm)
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    Promise.all([fetchCategories(), fetchUsers()])
      .then(([cats, users]) => { setCategories(cats); setAllUsers(users) })
      .catch(err => { console.error(err); setError(err.message) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const startEdit = (c: Category) => {
    setEditingId(c.id)
    setEditData({
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
      splits: c.splits.map(s => ({ user_id: s.user_id, weight: s.weight })),
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = (id: number) => {
    const err = validateSplitWeights(editData.splits ?? [])
    if (err) { showToast(err); return }
    updateCategory(id, editData)
      .then(() => { cancelEdit(); load() })
      .catch(err => showToast(err.message))
  }

  const confirmDelete = () => {
    if (!deletingCategory) return
    deleteCategory(deletingCategory.id)
      .then(() => load())
      .catch(err => showToast(err.message))
      .finally(() => setDeletingCategory(null))
  }

  const saveNew = () => {
    if (!newData.name || !newData.type) { showToast('Name and type are required'); return }
    const err = validateSplitWeights(newData.splits ?? [])
    if (err) { showToast(err); return }
    createCategory(newData)
      .then(() => { setShowNew(false); setNewData(emptyForm); load() })
      .catch(err => showToast(err.message))
  }

  const cancelNew = () => {
    setShowNew(false)
    setNewData(emptyForm)
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-accent hover:underline text-sm mb-4 cursor-pointer">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Categories</h2>
        <Button onClick={() => setShowNew(true)}>+ New Category</Button>
      </div>

      {showNew && (
        <div className="p-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex gap-2 flex-wrap items-end">
            <IconPicker value={newData.icon ?? null} onChange={icon => setNewData({ ...newData, icon })} />
            <ColorPicker value={newData.color ?? null} onChange={color => setNewData({ ...newData, color })} />
            <Input placeholder="Name" value={newData.name} onChange={e => setNewData({ ...newData, name: e.target.value })} />
            <Input placeholder="Type (Income / Expense / Transfer)" value={newData.type} onChange={e => setNewData({ ...newData, type: e.target.value })} />
            <Button onClick={saveNew}>Save</Button>
            <Button variant="secondary" onClick={cancelNew}>Cancel</Button>
          </div>
          <SplitEditor
            rows={toRows(newData.splits ?? [])}
            allUsers={allUsers}
            unit="weight"
            label="Default Split Weight (highest priority; leave empty to fall back to the account or global weight)"
            onChange={rows => setNewData({ ...newData, splits: fromRows(rows) })}
          />
        </div>
      )}

      <StatusMessage loading={loading} />

      {!loading && (
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Default Split</Th>
              <Th className="text-center">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {categories.length === 0 && (
              <Tr><Td colSpan={4} className="text-center py-5 text-slate-400">No categories yet</Td></Tr>
            )}
            {categories.map(c => (
              <Tr key={c.id}>
                {editingId === c.id ? (
                  <>
                    <Td>
                      <div className="flex gap-1.5 items-center">
                        <IconPicker value={editData.icon ?? null} onChange={icon => setEditData({ ...editData, icon })} />
                        <ColorPicker value={editData.color ?? null} onChange={color => setEditData({ ...editData, color })} />
                        <Input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} />
                      </div>
                    </Td>
                    <Td><Input value={editData.type ?? ''} onChange={e => setEditData({ ...editData, type: e.target.value })} /></Td>
                    <Td colSpan={2}>
                      <SplitEditor
                        rows={toRows(editData.splits ?? [])}
                        allUsers={allUsers}
                        unit="weight"
                        label="Default Split Weight (highest priority; leave empty to fall back to the account or global weight)"
                        onChange={rows => setEditData({ ...editData, splits: fromRows(rows) })}
                      />
                      <div className="mt-1.5 flex gap-1">
                        <Button size="sm" onClick={() => saveEdit(c.id)}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                      </div>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td><CategoryBadge name={c.name} color={c.color} icon={c.icon} /></Td>
                    <Td>{c.type}</Td>
                    <Td className="text-xs">
                      {c.splits.length === 0
                        ? <span className="text-slate-400">— (uses account/global default)</span>
                        : c.splits.map(s => `${s.user_name}: ${s.weight}`).join(', ')}
                    </Td>
                    <Td className="text-center">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(c)} className="mr-1">Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setDeletingCategory(c)}>Delete</Button>
                    </Td>
                  </>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <ConfirmDialog
        isOpen={deletingCategory !== null}
        title="Delete category"
        message={`Delete category "${deletingCategory?.name}"?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingCategory(null)}
      />
    </div>
  )
}
