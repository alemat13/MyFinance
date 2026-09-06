import { Category } from '../api/client'

export function categoryNameFor(id: number | null | undefined, categories: Category[]): string {
  if (id === null || id === undefined) return 'Uncategorized'
  return categories.find(c => c.id === id)?.name ?? `Category ${id}`
}
