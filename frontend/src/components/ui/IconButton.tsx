import { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
}

export function IconButton({ className = '', ...rest }: IconButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer transition-colors ${className}`}
      {...rest}
    />
  )
}
