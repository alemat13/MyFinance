import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ChevronDown, ChevronRight } from 'lucide-react'
import { Account } from '../api/client'
import { AccountTypeGroup, filterGroups, groupAccounts } from '../utils/accountGroups'

interface AccountPickerProps {
  accounts: Account[]
  value: number | null | undefined
  onChange: (id: number | null) => void
  /** Shown on the trigger when nothing is selected, and as the "no account" choice. */
  placeholder?: string
  /** Whether the placeholder can be picked to clear the selection. */
  allowEmpty?: boolean
  className?: string
  disabled?: boolean
  id?: string
  /** Renders the menu in a fixed-position layer on document.body, for a picker
   *  inside a scrolling container (a table row) that would otherwise clip it.
   *  Never inside a Modal: the dialog's focus trap would keep the search box
   *  from taking focus. */
  portal?: boolean
}

const ARCHIVED_KEY = 'archived'
const MENU_WIDTH = 288
const MENU_MAX_HEIGHT = 340

const triggerClasses =
  'flex items-center justify-between gap-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
const rowClasses = 'flex w-full items-center px-2 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer'
const selectedClasses = 'bg-slate-50 dark:bg-slate-700 font-medium'

const groupKey = (g: AccountTypeGroup) => `type:${g.key}`

export default function AccountPicker({
  accounts, value, onChange, placeholder = 'Account', allowEmpty = true, className = '', disabled = false, id, portal = false,
}: AccountPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [alignRight, setAlignRight] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = value != null ? accounts.find(a => a.id === value) ?? null : null
  const groups = useMemo(() => groupAccounts(accounts), [accounts])

  const close = () => { setOpen(false); setSearch('') }

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // Seed the expansion once per open: the sub-menu holding the current account,
  // or the only sub-menu there is.
  useEffect(() => {
    if (!open) return
    const next = new Set<string>()
    if (selected) {
      if (selected.archived) next.add(ARCHIVED_KEY)
      else {
        const g = groups.open.find(g => g.accounts.some(a => a.id === selected.id))
        if (g) next.add(groupKey(g))
      }
    } else if (groups.open.length === 1 && groups.archived.length === 0) {
      next.add(groupKey(groups.open[0]))
    }
    setExpanded(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A menu wider than the trigger would run off the right edge of a phone screen
  // (and scroll the whole dialog sideways): anchor it to the trigger's right edge then.
  useLayoutEffect(() => {
    if (!open || portal) return
    const rect = triggerRef.current?.getBoundingClientRect()
    setAlignRight(!!rect && rect.left + MENU_WIDTH > window.innerWidth - 8)
  }, [open, portal])

  useLayoutEffect(() => {
    if (!open || !portal) return
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))
      setMenuStyle(below < MENU_MAX_HEIGHT && rect.top > below
        ? { position: 'fixed', left, bottom: window.innerHeight - rect.top + 4 }
        : { position: 'fixed', left, top: rect.bottom + 4 })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, portal])

  const searching = search.trim().length > 0
  const visibleOpen = searching ? filterGroups(groups.open, search) : groups.open
  const visibleArchived = searching ? filterGroups(groups.archived, search) : groups.archived
  const archivedCount = groups.archived.reduce((n, g) => n + g.accounts.length, 0)
  const matches = [...visibleOpen, ...visibleArchived].flatMap(g => g.accounts)

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const select = (accountId: number | null) => {
    onChange(accountId)
    close()
  }

  const accountRow = (a: Account, indent: string) => (
    <button
      key={a.id}
      type="button"
      role="option"
      aria-selected={value === a.id}
      onClick={() => select(a.id)}
      className={`${rowClasses} ${indent} ${value === a.id ? selectedClasses : ''}`}
    >
      <span className="truncate">{a.name}</span>
    </button>
  )

  const subMenuHeader = (key: string, label: ReactNode, count: number, icon?: ReactNode) => {
    const isExpanded = searching || expanded.has(key)
    return (
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => { if (!searching) toggle(key) }}
        className={`${rowClasses} gap-1 font-medium text-slate-700 dark:text-slate-200`}
      >
        <span className="text-slate-400">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        {icon}
        <span className="flex-1 truncate">{label}</span>
        <span className="text-xs font-normal text-slate-400">{count}</span>
      </button>
    )
  }

  const menu = (
    <div
      ref={menuRef}
      style={portal ? { ...menuStyle, width: MENU_WIDTH } : undefined}
      className={`${portal ? 'z-[1100]' : `absolute z-10 mt-1 w-72 max-w-[calc(100vw-1rem)] ${alignRight ? 'right-0' : 'left-0'}`} rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg`}
    >
      <div className="p-2 border-b border-slate-100 dark:border-slate-700">
        <input
          autoFocus
          aria-label="Search accounts"
          placeholder="Search accounts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); triggerRef.current?.focus() }
            if (e.key === 'Enter') { e.preventDefault(); if (searching && matches.length > 0) select(matches[0].id) }
          }}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
        />
      </div>
      <div role="listbox" aria-label="Accounts" className="overflow-y-auto py-1" style={{ maxHeight: MENU_MAX_HEIGHT - 50 }}>
        {allowEmpty && !searching && (
          <button
            type="button"
            role="option"
            aria-selected={value == null}
            onClick={() => select(null)}
            className={`${rowClasses} text-slate-500 dark:text-slate-400 ${value == null ? selectedClasses : ''}`}
          >
            {placeholder}
          </button>
        )}
        {matches.length === 0 && (
          <div className="px-2 py-3 text-xs text-slate-400 text-center">No matching accounts</div>
        )}
        {visibleOpen.map(g => (
          <div key={g.key}>
            {subMenuHeader(groupKey(g), g.label, g.accounts.length)}
            {(searching || expanded.has(groupKey(g))) && g.accounts.map(a => accountRow(a, 'pl-7'))}
          </div>
        ))}
        {visibleArchived.length > 0 && (
          <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700">
            {subMenuHeader(
              ARCHIVED_KEY,
              'Archived',
              searching ? visibleArchived.reduce((n, g) => n + g.accounts.length, 0) : archivedCount,
              <Archive size={13} className="text-slate-400" />,
            )}
            {(searching || expanded.has(ARCHIVED_KEY)) && visibleArchived.map((g, i) => (
              <div key={g.key}>
                <div
                  role="separator"
                  className={`ml-7 mr-2 mt-1 pt-1 pb-0.5 text-[11px] uppercase tracking-wide text-slate-400 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-700' : ''}`}
                >
                  {g.label}
                </div>
                {g.accounts.map(a => accountRow(a, 'pl-7 text-slate-500 dark:text-slate-400'))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={`${triggerClasses} min-w-[140px] w-full`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-500 dark:text-slate-400'}`}>
          {selected ? selected.name : placeholder}
          {selected?.archived && <span className="ml-1 text-xs text-slate-400">(archived)</span>}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>
      {open && (portal ? createPortal(menu, document.body) : menu)}
    </div>
  )
}
