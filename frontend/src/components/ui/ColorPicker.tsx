import { useEffect, useRef, useState } from 'react'
import { CATEGORY_COLOR_PALETTE, DEFAULT_CATEGORY_COLOR } from '../../utils/categoryColors'

interface ColorPickerProps {
  value: string | null
  onChange: (color: string | null) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const swatchColor = value ?? DEFAULT_CATEGORY_COLOR

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
        title="Color"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
      >
        <span className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: swatchColor }} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 p-2 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          <div className="grid grid-cols-6 gap-1 mb-2">
            {CATEGORY_COLOR_PALETTE.map(c => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { onChange(c); setOpen(false) }}
                className={`w-6 h-6 rounded-sm cursor-pointer ${value === c ? 'ring-2 ring-offset-1 ring-accent' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            Custom
            <input
              type="color"
              value={value ?? DEFAULT_CATEGORY_COLOR}
              onChange={e => onChange(e.target.value)}
              className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
            />
          </label>
        </div>
      )}
    </div>
  )
}
