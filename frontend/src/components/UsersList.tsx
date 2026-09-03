import {
  User, UserCreate, UserUpdate,
  fetchUsers, createUser, updateUser, deleteUser,
} from '../api/client'
import { useCrudList } from '../hooks/useCrudList'
import { Button, Input, Card, Table, Thead, Tbody, Tr, Th, Td, StatusMessage, ConfirmDialog, BackButton } from './ui'

interface Props {
  onBack: () => void
  onSelectUser: (userId: number | null) => void
}

const emptyForm: UserCreate = { name: '', email: '' }

export default function UsersList({ onBack, onSelectUser }: Props) {
  const {
    items: users, loading, error,
    editingId, editData, setEditData, startEdit, cancelEdit, saveEdit,
    showNew, setShowNew, newData, setNewData, saveNew, cancelNew,
    deletingItem: deletingUser, setDeletingItem: setDeletingUser, confirmDelete,
  } = useCrudList<User, UserCreate, UserUpdate>({
    fetchAll: fetchUsers,
    create: createUser,
    update: updateUser,
    remove: deleteUser,
    getId: u => u.id,
    emptyForm,
    toEditData: u => ({ name: u.name, email: u.email }),
    validate: d => !d.name ? 'Name is required' : null,
  })

  if (error) {
    return <StatusMessage error={error} />
  }

  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Users</h2>
        <Button onClick={() => setShowNew(true)}>+ New User</Button>
      </div>

      {showNew && (
        <Card className="p-3 mb-3">
          <div className="flex gap-2 flex-wrap items-end">
            <Input placeholder="Name" value={newData.name} onChange={e => setNewData({ ...newData, name: e.target.value })} />
            <Input placeholder="Email" type="email" value={newData.email ?? ''} onChange={e => setNewData({ ...newData, email: e.target.value || null })} />
            <Button variant="primary" onClick={saveNew}>Save</Button>
            <Button variant="secondary" onClick={cancelNew}>Cancel</Button>
          </div>
        </Card>
      )}

      <StatusMessage loading={loading} />

      {!loading && (
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th className="text-center">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {users.length === 0 && (
              <Tr><Td colSpan={3} className="text-center py-5 text-slate-400">No users yet</Td></Tr>
            )}
            {users.map(u => (
              <Tr key={u.id}>
                {editingId === u.id ? (
                  <>
                    <Td><Input value={editData.name ?? ''} onChange={e => setEditData({ ...editData, name: e.target.value })} /></Td>
                    <Td><Input value={editData.email ?? ''} onChange={e => setEditData({ ...editData, email: e.target.value || null })} /></Td>
                    <Td className="text-center">
                      <Button size="sm" onClick={() => saveEdit(u.id)} className="mr-1">Save</Button>
                      <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td>
                      <button
                        onClick={() => onSelectUser(u.id)}
                        className="text-accent hover:underline cursor-pointer"
                        title="Filter by this user"
                      >
                        {u.name}
                      </button>
                    </Td>
                    <Td>{u.email ?? ''}</Td>
                    <Td className="text-center">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(u)} className="mr-1">Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setDeletingUser(u)}>Delete</Button>
                    </Td>
                  </>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <ConfirmDialog
        isOpen={deletingUser !== null}
        title="Delete user"
        message={`Delete user "${deletingUser?.name}"?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  )
}
