import { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

export type BadgeVariant = 'positive' | 'negative' | 'warning' | 'info' | 'neutral'

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      positive: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
      negative: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
      warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
      info: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
      neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    },
  },
  defaultVariants: { variant: 'neutral' },
})

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ variant, className, ...rest }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...rest} />
}
