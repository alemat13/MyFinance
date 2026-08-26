import { InputHTMLAttributes, SelectHTMLAttributes } from 'react'

const fieldClasses =
  'rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:opacity-50'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClasses} ${className}`} {...rest} />
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClasses} ${className}`} {...rest} />
}
