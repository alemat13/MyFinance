import { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg',
        className
      )}
      {...rest}
    />
  )
}
