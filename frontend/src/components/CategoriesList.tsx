import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Category, CategoryCreate, CategoryUpdate, CategorySplitCreate,
  User, fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchUsers,
} from '../api/client'
import SplitEditor, { SplitRow } from './SplitEditor'
import { useCrudList } from '../hooks/useCrudList'
import {
  Button, Input, Select, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, ConfirmDialog,
  CategoryBadge, IconPicker, ColorPicker, BackButton,
} from './ui'
import { groupCategoriesByParent, isValidParentCandidate } from '../utils/categoryHierarchy'

interface Props {
  onBack: () => void
}

const emptyForm: CategoryCreate = { name: '', type: '', color: null, icon: null, parent_id: null, splits: [] }

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
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const {
    items: categories, loading, error,
    editingId, editData, setEditData, startEdit, cancelEdit, saveEdit,
    showNew, setShowNew, newData, setNewData, saveNew, cancelNew,
    deletingItem: deletingCategory, setDeletingItem: setDeletingCategory, confirmDelete,
  } = useCrudList<Category, CategoryCreate, CategoryUpdate>({
    fetchAll: () => Promise.all([fetchCategories(), fetchUsers()]).then(([cats, users]) => { setAllUsers(users); return cats }),
    create: createCategory,
    update: updateCategory,
    remove: deleteCategory,
    getId: c => c.id,
    emptyForm,
    toEditData: c => ({
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
      parent_id: c.parent_id ?? null,
      splits: c.splits.map(s => ({ user_id: s.user_id, weight: s.weight })),
    }),
    validate: d => {
      if (!d.name || !d.type) return 'Name and type are required'
      return validateSplitWeights(d.splits ?? [])
    },
  })

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const startNewSubcategory = (parent: Category) => {
    setShowNew(true)
    setNewData({ ...emptyForm, parent_id: parent.id, type: parent.type })
    setExpandedIds(prev => new Set(prev).add(parent.id))
  }

  if (error) {
    return <StatusMessage error={error} />
  }

  const renderRow = (
    c: Category,
    opts: { hasChildren?: boolean; isExpanded?: boolean; childCount?: number; indent?: boolean } = {},
  ) => {
    const isEditing = editingId === c.id
    const editingHasChildren = categories.some(x => x.parent_id === c.id)
    const typeLocked = !!editData.parent_id || editingHasChildren

    return (
      <Tr key={c.id}>
        {isEditing ? (
          <>
            <Td>
              <div className={`flex gap-1.5 items-center ${opts.indent ? 'pl-6' : ''}`}>
                <IconPicker value={editData.icon ?? null} onChange={icon => setEditData({ ...editData, icon })} />
                <ColorPicker value={editData.color ?? null} onChange={color => setEditData({ ...editData, color })} />
                <Input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} />
              </div>
            </Td>
            <Td>
              <div className="flex flex-col gap-1">
                <Input
                  value={editData.type ?? ''}
                  disabled={typeLocked}
                  onChange={e => setEditData({ ...editData, type: e.target.value })}
                />
                <Select
                  value={editData.parent_id ?? 0}
                  disabled={editingHasChildren}
                  onChange={e => {
                    const pid = parseInt(e.target.value) || null
                    const parentCat = categories.find(x => x.id === pid)
                    setEditData({ ...editData, parent_id: pid, type: parentCat ? parentCat.type : editData.type })
                  }}
                  className="text-xs"
                >
                  <option value={0}>None (top-level)</option>
                  {categories.filter(x => isValidParentCandidate(x, c.id)).map(x => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </Select>
                {editingHasChildren && (
                  <span className="text-xs text-slate-400">Has subcategories — can't set a parent</span>
                )}
              </div>
            </Td>
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
            <Td>
              <div className={`flex items-center gap-1 ${opts.indent ? 'pl-6' : ''}`}>
                {opts.hasChildren !== undefined ? (
                  opts.hasChildren ? (
                    <button
                      type="button"
                      title={opts.isExpanded ? 'Collapse' : 'Expand'}
                      onClick={() => toggleExpanded(c.id)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {opts.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : (
                    <span className="inline-block w-[14px]" />
                  )
                ) : null}
                <CategoryBadge name={c.name} color={c.color} icon={c.icon} />
              </div>
              {opts.hasChildren && (
                <div className="text-xs text-slate-400 pl-5">{opts.childCount} subcategories</div>
              )}
            </Td>
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
    )
  }

  return (
    <div>
      <BackButton onClick={onBack} />
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
            <Select
              value={newData.parent_id ?? 0}
              onChange={e => {
                const pid = parseInt(e.target.value) || null
                const parent = categories.find(c => c.id === pid)
                setNewData({ ...newData, parent_id: pid, type: parent ? parent.type : newData.type })
              }}
            >
              <option value={0}>None (top-level category)</option>
              {categories.filter(c => isValidParentCandidate(c)).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input
              placeholder="Type (Income / Expense / Transfer)"
              value={newData.type}
              disabled={!!newData.parent_id}
              onChange={e => setNewData({ ...newData, type: e.target.value })}
            />
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
            {groupCategoriesByParent(categories).map(({ parent, children }) => {
              const isExpanded = expandedIds.has(parent.id)
              return (
                <Fragment key={parent.id}>
                  {renderRow(parent, { hasChildren: children.length > 0, isExpanded, childCount: children.length })}
                  {isExpanded && children.map(child => renderRow(child, { indent: true }))}
                  {isExpanded && (
                    <Tr>
                      <Td colSpan={4}>
                        <button
                          type="button"
                          onClick={() => startNewSubcategory(parent)}
                          className="pl-6 text-xs text-accent hover:underline cursor-pointer"
                        >
                          + Add subcategory
                        </button>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              )
            })}
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
