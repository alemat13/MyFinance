import { useEffect, useRef, useState } from 'react'
import { Tag, TagRef, createTag } from '../api/client'
import { useToast } from '../context/ToastContext'
import TagChips from './TagChips'

interface Props {
  tags: Tag[]
  value: number[]
  onChange: (ids: number[]) => void
  // Called with a tag created from the box, so the caller can add it to its list.
  onCreated?: (tag: Tag) => void
  // Off where a new name makes no sense (e.g. removing tags in bulk).
  allowCreate?: boolean
  placeholder?: string
  className?: string
  'aria-label'?: string
}

/** Several tags picked from the existing ones, or typed: Enter (or the
 *  "Create" entry) creates a tag that does not exist yet. */
export default function TagPicker({
  tags, value, onChange, onCreated, allowCreate = true, placeholder = 'Add a tag…', className = '',
  'aria-label': ariaLabel = 'Tags',
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const selected: TagRef[] = value
    .map(id => tags.find(t => t.id === id))
    .filter((t): t is Tag => !!t)
  const needle = query.trim().toLowerCase()
  const options = tags.filter(t => !value.includes(t.id) && t.name.toLowerCase().includes(needle))
  const exact = tags.find(t => t.name.toLowerCase() === needle)
  const canCreate = allowCreate && needle !== '' && !exact && !/[,;|]/.test(query)

  const add = (id: number) => {
    if (!value.includes(id)) onChange([...value, id])
    setQuery('')
  }

  const create = () => {
    if (!canCreate || creating) return
    setCreating(true)
    createTag({ name: query.trim() })
      .then(tag => { onCreated?.(tag); onChange([...value, tag.id]); setQuery('') })
      .catch(err => showToast(err.message))
      .finally(() => setCreating(false))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (exact && !value.includes(exact.id)) add(exact.id)
      else if (canCreate) create()
      else if (options.length > 0) add(options[0].id)
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    } else if (e.key === 'Escape' && open) {
      // Close the list without letting the dialog around it close too.
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        className="flex flex-wrap items-center gap-1 min-h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 focus-within:ring-2 focus-within:ring-accent focus-within:border-accent"
        onClick={() => setOpen(true)}
      >
        <TagChips tags={selected} onRemove={tag => onChange(value.filter(id => id !== tag.id))} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? placeholder : ''}
          aria-label={ariaLabel}
          className="flex-1 min-w-[90px] bg-transparent text-base md:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none py-0.5"
        />
      </div>
      {open && (options.length > 0 || canCreate) && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
        >
          {options.map(t => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => add(t.id)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <TagChips tags={[t]} />
              <span className="text-xs text-slate-400">{t.transaction_count}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="flex w-full items-center px-2.5 py-1.5 text-sm text-left text-accent hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Create tag “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
