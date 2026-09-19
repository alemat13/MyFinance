import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Sheet } from './ui'
import { View, PRIMARY_VIEWS, MORE_VIEWS, viewLabels, viewIcons } from '../nav'
import { cn } from '../lib/utils'

interface Props {
  view: View
  onNavigate: (v: View) => void
  disabled: boolean
}

const tabClass = (active: boolean) =>
  cn(
    'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
    'md:flex-none md:flex-row md:gap-1.5 md:rounded-md md:px-3 md:py-1.5 md:text-sm',
    active
      ? 'text-accent md:bg-accent/10'
      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100 md:hover:bg-slate-100 md:dark:hover:bg-slate-700'
  )

// Renders once; only CSS repositions it between breakpoints (fixed bottom bar
// on mobile, inline bar in the header on desktop) so there's never a second,
// duplicate set of nav buttons in the DOM.
export default function NavShell({ view, onNavigate, disabled }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = (MORE_VIEWS as View[]).includes(view)

  const go = (v: View) => {
    onNavigate(v)
    setMoreOpen(false)
  }

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[900] flex items-stretch justify-around border-t border-slate-200 bg-white pb-safe dark:border-slate-700 dark:bg-slate-800
          md:static md:inset-auto md:z-auto md:justify-start md:gap-1 md:border-none md:bg-transparent md:pb-0 md:dark:bg-transparent"
      >
        {PRIMARY_VIEWS.map(v => {
          const Icon = viewIcons[v]
          return (
            <button key={v} type="button" disabled={disabled} onClick={() => go(v)} className={tabClass(view === v)}>
              <Icon size={20} className="md:hidden" aria-hidden="true" />
              <Icon size={16} className="hidden md:block" aria-hidden="true" />
              {viewLabels[v]}
            </button>
          )
        })}
        <button type="button" disabled={disabled} onClick={() => setMoreOpen(true)} className={tabClass(moreActive)}>
          <MoreHorizontal size={20} className="md:hidden" aria-hidden="true" />
          <MoreHorizontal size={16} className="hidden md:block" aria-hidden="true" />
          More
        </button>
      </nav>

      <Sheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="flex flex-col">
          {MORE_VIEWS.map(v => {
            const Icon = viewIcons[v]
            return (
              <button
                key={v}
                type="button"
                onClick={() => go(v)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm cursor-pointer',
                  view === v
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                )}
              >
                <Icon size={18} aria-hidden="true" />
                {viewLabels[v]}
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}
