import { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
}

export function IconButton({ className, ...rest }: IconButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className
      )}
      {...rest}
    />
  )
}
