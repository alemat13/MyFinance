import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from './ui'

interface ExportMenuProps {
  onExport: (format: 'csv' | 'xlsx') => void
  exporting?: boolean
}

export default function ExportMenu({ onExport, exporting = false }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const select = (format: 'csv' | 'xlsx') => {
    onExport(format)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" onClick={() => setOpen(o => !o)} disabled={exporting}>
        {exporting ? (
          'Exporting...'
        ) : (
          <span className="flex items-center gap-1">
            Export
            <ChevronDown size={14} />
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute z-10 mt-1 right-0 w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          <button
            type="button"
            onClick={() => select('csv')}
            className="flex w-full items-center px-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => select('xlsx')}
            className="flex w-full items-center px-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
          >
            Excel
          </button>
        </div>
      )}
    </div>
  )
}
