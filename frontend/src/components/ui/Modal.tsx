import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'lg'
}

const SIZE_CLASSES: Record<'sm' | 'lg', string> = {
  sm: 'max-w-sm',
  lg: 'max-w-2xl max-h-[85vh] overflow-y-auto',
}

// Stack of currently-open Modal instances (by a per-instance id), topmost
// (most recently opened) last. Modals can be nested (e.g. a ConfirmDialog
// opened from within another Modal); without this, every open Modal's
// Escape listener would fire independently and close all of them at once
// instead of just the topmost one.
let openModalStack: symbol[] = []

export function Modal({ isOpen, onClose, title, children, size = 'sm' }: ModalProps) {
  const idRef = useRef<symbol | null>(null)
  if (!idRef.current) idRef.current = Symbol('modal')

  useEffect(() => {
    if (!isOpen) return
    const id = idRef.current!
    openModalStack.push(id)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openModalStack[openModalStack.length - 1] === id) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openModalStack = openModalStack.filter(stackId => stackId !== id)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${SIZE_CLASSES[size]} rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
            <IconButton aria-label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
