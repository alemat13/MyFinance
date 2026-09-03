import { Category } from '../api/client'

export interface CategoryGroup {
  parent: Category
  children: Category[]
}

/**
 * Client-side mirror of backend main.py's 2-level category hierarchy:
 * top-level categories (parent_id == null) each paired with their direct
 * subcategories, preserving the flat GET /api/categories response shape
 * (no nested API payload) the same way TransactionOut denormalizes
 * category_name/color/icon instead of nesting a Category object.
 */
export function groupCategoriesByParent(categories: Category[]): CategoryGroup[] {
  const childrenByParent = new Map<number, Category[]>()
  for (const c of categories) {
    if (c.parent_id == null) continue
    const siblings = childrenByParent.get(c.parent_id) ?? []
    siblings.push(c)
    childrenByParent.set(c.parent_id, siblings)
  }
  return categories
    .filter(c => c.parent_id == null)
    .map(parent => ({ parent, children: childrenByParent.get(parent.id) ?? [] }))
}

/** Only a top-level category (no parent of its own) may be chosen as a parent — mirrors the backend's `parent.parent_id is not None` rejection. */
export function isValidParentCandidate(category: Category, excludeId?: number): boolean {
  return category.parent_id == null && category.id !== excludeId
}

/** Case-insensitive match against a category's own name or its parent's name, for the transaction category picker's search box. */
export function matchesSearch(category: Category, parentName: string | null, query: string): boolean {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return category.name.toLowerCase().includes(q) || (parentName?.toLowerCase().includes(q) ?? false)
}
