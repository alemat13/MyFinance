import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { Category } from '../api/client'
import { CategoryBadge } from './ui'
import { UNCATEGORIZED_ID, groupCategoriesByParent, matchesSearch } from '../utils/categoryHierarchy'

interface CategoryPickerProps {
  categories: Category[]
  value: number | null | undefined
  onChange: (id: number | null) => void
  allowUncategorized?: boolean
  placeholder?: string
  className?: string
  /** For a filter: null is then this label ("All categories"), and an extra
   *  "Uncategorized" choice picks UNCATEGORIZED_ID. */
  anyLabel?: string
  /** Given, several categories can be ticked (UNCATEGORIZED_ID included,
   *  with anyLabel): the menu stays open and `value`/`onChange` are unused. */
  values?: number[]
  onChangeMany?: (ids: number[]) => void
}

const triggerClasses =
  'flex items-center justify-between gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent cursor-pointer'

export default function CategoryPicker({
  categories, value, onChange, allowUncategorized = true, placeholder = 'Uncategorized', className = '', anyLabel,
  values, onChangeMany,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  const multi = values !== undefined
  const isSelected = (id: number | null) => multi ? id != null && values.includes(id) : value === id
  const selected = !multi && value != null ? categories.find(c => c.id === value) ?? null : null
  const ticked = multi ? values.map(id => categories.find(c => c.id === id)).filter((c): c is Category => !!c) : []
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
    if (!open) return
    const parentIds = (multi ? ticked : selected ? [selected] : []).map(c => c.parent_id).filter((id): id is number => id != null)
    if (parentIds.length === 0) return
    setExpanded(prev => new Set([...prev, ...parentIds]))
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
    if (multi) {
      if (id != null) onChangeMany?.(values.includes(id) ? values.filter(v => v !== id) : [...values, id])
      return
    }
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  // In multi mode, a box before each choice, ticked when it is selected.
  const tick = (id: number) => multi ? (
    <span className={`mr-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${isSelected(id) ? 'border-accent bg-accent text-white' : 'border-slate-300 dark:border-slate-500'}`}>
      {isSelected(id) && <Check size={10} strokeWidth={3} />}
    </span>
  ) : null

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button type="button" className={`${triggerClasses} min-w-[160px] w-full`} onClick={() => setOpen(o => !o)}>
        {multi ? (
          values.length === 0
            ? <span className="text-slate-500 dark:text-slate-400 truncate">{anyLabel ?? placeholder}</span>
            : values.length === 1
              ? (ticked[0]
                ? <CategoryBadge name={ticked[0].name} color={ticked[0].color} icon={ticked[0].icon} />
                : <CategoryBadge name={null} />)
              : <span className="truncate">{values.length} categories</span>
        ) : selected
          ? <CategoryBadge name={selected.name} color={selected.color} icon={selected.icon} />
          : anyLabel && value !== UNCATEGORIZED_ID
            ? <span className="text-slate-500 dark:text-slate-400 truncate">{anyLabel}</span>
            : <CategoryBadge name={null} />}
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
            {(anyLabel || allowUncategorized) && !searching && !multi && (
              <button
                type="button"
                onClick={() => select(null)}
                className={`flex w-full items-center px-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${!multi && value == null ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
              >
                {anyLabel ?? placeholder}
              </button>
            )}
            {anyLabel && !searching && (
              <button
                type="button"
                role={multi ? 'option' : undefined}
                aria-selected={multi ? isSelected(UNCATEGORIZED_ID) : undefined}
                onClick={() => select(UNCATEGORIZED_ID)}
                className={`flex w-full items-center px-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${isSelected(UNCATEGORIZED_ID) ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
              >
                {tick(UNCATEGORIZED_ID)}
                <CategoryBadge name={null} />
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
                    className={`flex items-center w-full px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${isSelected(g.parent.id) ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
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
                    <button type="button" onClick={() => select(g.parent.id)} className="flex-1 flex items-center justify-between text-left cursor-pointer"
                            role={multi ? 'option' : undefined} aria-selected={multi ? isSelected(g.parent.id) : undefined}>
                      <span className="flex items-center">{tick(g.parent.id)}<CategoryBadge name={g.parent.name} color={g.parent.color} icon={g.parent.icon} /></span>
                      {g.children.length > 0 && <span className="text-xs text-slate-400">{g.children.length}</span>}
                    </button>
                  </div>
                  {isExpanded && g.childrenToShow.map(child => (
                    <button
                      key={child.id}
                      type="button"
                      role={multi ? 'option' : undefined}
                      aria-selected={multi ? isSelected(child.id) : undefined}
                      onClick={() => select(child.id)}
                      className={`flex w-full items-center pl-7 pr-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${isSelected(child.id) ? 'bg-slate-50 dark:bg-slate-700' : ''}`}
                    >
                      {tick(child.id)}
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
