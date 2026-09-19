import { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface SheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// One panel, two layouts via CSS only: a bottom sheet on mobile (thumb-reachable,
// dismissable by swiping down conceptually via the drag handle) and a right-hand
// drawer on desktop (where a bottom sheet would look out of place). Built on the
// same Radix Dialog primitive as Modal, so it gets the same nested-dialog-safe
// Escape handling and focus trap for free.
export function Sheet({ isOpen, onClose, title, children }: SheetProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-[1000] flex flex-col bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-xl focus:outline-none
            inset-x-0 bottom-0 max-h-[80vh] rounded-t-xl border-t
            md:inset-x-auto md:inset-y-0 md:left-auto md:right-0 md:top-0 md:bottom-auto md:h-full md:w-80 md:max-h-none md:rounded-t-none md:rounded-l-xl md:border-t-0 md:border-l"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600 md:hidden" aria-hidden="true" />
          <Dialog.Title className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 shrink-0">
            {title}
            <Dialog.Close asChild>
              <IconButton aria-label="Close">
                <X size={16} />
              </IconButton>
            </Dialog.Close>
          </Dialog.Title>
          <div className="p-2 overflow-y-auto pb-safe">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
