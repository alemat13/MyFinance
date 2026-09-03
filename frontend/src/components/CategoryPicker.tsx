import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Category } from '../api/client'
import { CategoryBadge } from './ui'
import { groupCategoriesByParent, matchesSearch } from '../utils/categoryHierarchy'

interface CategoryPickerProps {
  categories: Category[]
  value: number | null | undefined
  onChange: (id: number | null) => void
  allowUncategorized?: boolean
  placeholder?: string
  className?: string
}

const triggerClasses =
  'flex items-center justify-between gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent cursor-pointer'

export default function CategoryPicker({
  categories, value, onChange, allowUncategorized = true, placeholder = 'Uncategorized', className = '',
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  const selected = value != null ? categories.find(c => c.id === value) ?? null : null
  const groups = useMemo(() => groupCategoriesByParent(categories), [categories])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  useEffect(() => {
    if (!open || !selected?.parent_id) return
    setExpanded(prev => new Set(prev).add(selected.parent_id!))
    // Only seed the expansion once per open, from the value at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const searching = search.trim().length > 0

  const visibleGroups = groups
    .map(g => {
      const parentMatches = matchesSearch(g.parent, null, search)
      const matchingChildren = g.children.filter(c => matchesSearch(c, g.parent.name, search))
      const childrenToShow = parentMatches ? g.children : matchingChildren
      return { ...g, childrenToShow, matches: parentMatches || matchingChildren.length > 0 }
    })
    .filter(g => g.matches)

  const toggleExpanded = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const select = (id: number | null) => {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" className={`${triggerClasses} min-w-[160px] w-full`} onClick={() => setOpen(o => !o)}>
        {selected ? <CategoryBadge name={selected.name} color={selected.color} icon={selected.icon} /> : <CategoryBadge name={null} />}
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <input
              autoFocus
              placeholder="Search categories…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {allowUncategorized && !searching && (
              <button
                type="button"
                onClick={() => select(null)}
                className={`flex w-full items-center px-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${value == null ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
              >
                {placeholder}
              </button>
            )}
            {visibleGroups.length === 0 && (
              <div className="px-2 py-3 text-xs text-slate-400 text-center">No matching categories</div>
            )}
            {visibleGroups.map(g => {
              const isExpanded = searching ? g.childrenToShow.length > 0 : expanded.has(g.parent.id)
              return (
                <div key={g.parent.id}>
                  <div
                    className={`flex items-center w-full px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${value === g.parent.id ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
                  >
                    {g.children.length > 0 ? (
                      <button
                        type="button"
                        title={isExpanded ? 'Collapse' : 'Expand'}
                        onClick={e => { e.stopPropagation(); toggleExpanded(g.parent.id) }}
                        className="mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : (
                      <span className="w-[14px] mr-1" />
                    )}
                    <button type="button" onClick={() => select(g.parent.id)} className="flex-1 flex items-center justify-between text-left cursor-pointer">
                      <CategoryBadge name={g.parent.name} color={g.parent.color} icon={g.parent.icon} />
                      {g.children.length > 0 && <span className="text-xs text-slate-400">{g.children.length}</span>}
                    </button>
                  </div>
                  {isExpanded && g.childrenToShow.map(child => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => select(child.id)}
                      className={`flex w-full items-center pl-7 pr-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${value === child.id ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
                    >
                      <CategoryBadge name={child.name} color={child.color} icon={child.icon} />
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
