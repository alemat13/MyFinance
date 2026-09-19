import { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { cn } from '../../lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'lg'
}

// 'sm' (confirm dialogs, small forms) always stays a centered card, even on
// mobile — full-screening a two-button confirm would be worse, not better.
// 'lg' (record-editing forms) goes edge-to-edge below `md`, like a native
// full-page sheet, and becomes a centered, width-capped dialog at `md` and up.
const SIZE_CLASSES: Record<'sm' | 'lg', string> = {
  sm: 'max-w-sm max-h-[85vh] overflow-y-auto',
  lg: 'inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-full h-full md:h-auto md:max-w-2xl md:max-h-[85vh] rounded-none md:rounded-lg flex flex-col',
}

export function Modal({ isOpen, onClose, title, children, size = 'sm' }: ModalProps) {
  const isFullScreenCapable = size === 'lg'

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-[1000] w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl focus:outline-none',
            size === 'sm' && 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg',
            SIZE_CLASSES[size]
          )}
        >
          {title ? (
            <Dialog.Title
              className={cn(
                'flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100',
                isFullScreenCapable && 'shrink-0 pt-safe'
              )}
            >
              {title}
              <Dialog.Close asChild>
                <IconButton aria-label="Close">
                  <X size={16} />
                </IconButton>
              </Dialog.Close>
            </Dialog.Title>
          ) : (
            <Dialog.Title className="sr-only">Dialog</Dialog.Title>
          )}
          <div className={cn('p-4', isFullScreenCapable && 'flex-1 overflow-y-auto pb-safe')}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
