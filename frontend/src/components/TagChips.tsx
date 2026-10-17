import { X } from 'lucide-react'
import { TagRef } from '../api/client'
import { DEFAULT_CATEGORY_COLOR } from '../utils/categoryColors'

interface Props {
  tags: TagRef[] | undefined
  // Given, each chip gets a remove button.
  onRemove?: (tag: TagRef) => void
  className?: string
}

/** A transaction's tags as small coloured pills. Renders nothing when there is none. */
export default function TagChips({ tags, onRemove, className = '' }: Props) {
  if (!tags || tags.length === 0) return null
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {tags.map(tag => {
        const color = tag.color ?? DEFAULT_CATEGORY_COLOR
        return (
          <span
            key={tag.id}
            data-testid="tag-chip"
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium leading-4"
            style={{ backgroundColor: `${color}26`, color }}
          >
            #{tag.name}
            {onRemove && (
              <button
                type="button"
                aria-label={`Remove tag ${tag.name}`}
                onClick={e => { e.stopPropagation(); onRemove(tag) }}
                className="ml-0.5 rounded-full hover:bg-black/10 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </span>
        )
      })}
    </span>
  )
}
