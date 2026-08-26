import { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'

export function Table({ className = '', ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className={`w-full border-collapse text-sm ${className}`} {...rest} />
    </div>
  )
}

export function Thead({ className = '', ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={`bg-slate-50 dark:bg-slate-800 ${className}`} {...rest} />
}

export function Tbody({ className = '', ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={`bg-white dark:bg-slate-900 ${className}`} {...rest} />
}

export function Tr({ className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`border-b border-slate-200 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${className}`}
      {...rest}
    />
  )
}

export function Th({ className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 ${className}`}
      {...rest}
    />
  )
}

export function Td({ className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-3 py-2 text-slate-700 dark:text-slate-200 ${className}`} {...rest} />
}
