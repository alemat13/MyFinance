import { useEffect, useRef, useState } from 'react'
import { CATEGORY_ICON_NAMES, getCategoryIcon } from '../../utils/categoryIcons'

interface IconPickerProps {
  value: string | null
  onChange: (icon: string | null) => void
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const Icon = getCategoryIcon(value)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Icon"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
      >
        <Icon size={16} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 p-2 grid grid-cols-6 gap-1 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {CATEGORY_ICON_NAMES.map(name => {
            const OptionIcon = getCategoryIcon(name)
            return (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => { onChange(name); setOpen(false) }}
                className={`inline-flex items-center justify-center w-8 h-8 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 ${
                  value === name ? 'bg-slate-100 dark:bg-slate-700 ring-1 ring-accent' : ''
                }`}
              >
                <OptionIcon size={16} className="text-slate-600 dark:text-slate-300" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
