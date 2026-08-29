import { getCategoryIcon } from '../../utils/categoryIcons'
import { UNCATEGORIZED_COLOR, DEFAULT_CATEGORY_COLOR } from '../../utils/categoryColors'

interface CategoryBadgeProps {
  name: string | null
  color?: string | null
  icon?: string | null
}

export function CategoryBadge({ name, color, icon }: CategoryBadgeProps) {
  const label = name ?? 'Uncategorized'
  const resolvedColor = name === null ? UNCATEGORIZED_COLOR : (color ?? DEFAULT_CATEGORY_COLOR)
  const Icon = getCategoryIcon(name === null ? null : icon)

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0"
        style={{ backgroundColor: `${resolvedColor}26`, color: resolvedColor }}
      >
        <Icon size={12} />
      </span>
      <span className={name === null ? 'text-slate-400 italic' : ''}>{label}</span>
    </span>
  )
}
