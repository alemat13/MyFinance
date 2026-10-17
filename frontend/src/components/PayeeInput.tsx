import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Category, PayeeSuggestion, fetchPayeeSuggestions } from '../api/client'
import { formatMoney } from '../utils/currency'
import { Input, CategoryBadge } from './ui'

// Characters typed before suggestions are fetched: one letter matches half
// the ledger and says nothing about which merchant is meant.
export const PAYEE_SUGGESTION_MIN_CHARS = 2
const DEBOUNCE_MS = 250

interface Props {
  value: string
  categories: Category[]
  onChange: (payee: string) => void
  // A suggestion picked: the payee and the category it was last filed under.
  onPick: (suggestion: PayeeSuggestion) => void
  className?: string
}

// The Payee field with autocompletion from the most recent transactions whose
// payee contains what was typed. Suggestions are only fetched after the user
// types, never for the value the form opened with.
export default function PayeeInput({ value, categories, onChange, onPick, className }: Props) {
  const [query, setQuery] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PayeeSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query?.trim() ?? ''
    if (q.length < PAYEE_SUGGESTION_MIN_CHARS) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchPayeeSuggestions(q)
        .then(rows => {
          if (cancelled) return
          setSuggestions(rows)
          setActive(-1)
        })
        // A suggestion is a convenience: failing to get one must not get in
        // the way of typing the payee by hand.
        .catch(() => { if (!cancelled) setSuggestions([]) })
    }, DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const pick = (s: PayeeSuggestion) => {
    onPick(s)
    setOpen(false)
    setQuery(null)
    setSuggestions([])
  }

  const showList = open && suggestions.length > 0

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(suggestions[active])
    } else if (e.key === 'Escape') {
      // Close the list without letting the Modal close as well.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      <Input
        className="w-full"
        placeholder="Payee"
        aria-label="Payee"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        value={value}
        onChange={e => {
          onChange(e.target.value)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          role="listbox"
          aria-label="Payee suggestions"
          className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1"
        >
          {suggestions.map((s, i) => {
            const category = categories.find(c => c.id === s.category_id)
            return (
              <li
                key={`${s.payee}|${s.category_id}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: keeps the input focused, and runs
                // before any blur could close the list under the pointer.
                onMouseDown={e => { e.preventDefault(); pick(s) }}
                onMouseEnter={() => setActive(i)}
                className={`px-3 py-2 cursor-pointer text-sm ${i === active ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{s.payee}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                    {s.date} · {formatMoney(s.amount, s.currency)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs">
                  <CategoryBadge
                    name={s.category_id === null ? null : (s.category_name ?? category?.name ?? null)}
                    color={category?.color}
                    icon={category?.icon}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
