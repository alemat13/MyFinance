import { CheckCircle2, XCircle, X } from 'lucide-react'

export type ToastVariant = 'error' | 'success'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastStackProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

const variantStyles: Record<ToastVariant, string> = {
  error: 'bg-white dark:bg-slate-800 border-negative text-negative',
  success: 'bg-white dark:bg-slate-800 border-positive text-positive',
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[1100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map(t => (
        <div
          key={t.id}
          role="alert"
          className={`flex items-start gap-2 rounded-lg border-l-4 px-3 py-2 shadow-lg text-sm ${variantStyles[t.variant]}`}
        >
          {t.variant === 'error' ? (
            <XCircle size={18} className="shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          )}
          <span className="flex-1 text-slate-700 dark:text-slate-200">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
