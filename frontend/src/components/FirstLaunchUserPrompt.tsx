import { Modal, Button } from './ui'
import { User } from '../api/client'

interface FirstLaunchUserPromptProps {
  users: User[]
  loadError?: boolean
  onChoose: (userId: number) => void
}

export default function FirstLaunchUserPrompt({ users, loadError, onChoose }: FirstLaunchUserPromptProps) {
  return (
    <Modal isOpen onClose={() => { /* mandatory: not dismissable until a user is picked */ }}>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
        Who's using MyFinance?
      </h3>
      {loadError ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Couldn't load users — check that the backend is running, then reload.
        </p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No users yet — add one from the Users view, then reload.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(u => (
            <Button
              key={u.id}
              variant="secondary"
              className="justify-start"
              onClick={() => onChoose(u.id)}
            >
              {u.name}
            </Button>
          ))}
        </div>
      )}
    </Modal>
  )
}
