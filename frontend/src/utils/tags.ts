/** "No tag" in the simple filter's tag menu and the advanced filter's Tag
 *  condition (frontend only, like UNCATEGORIZED_ID): sent as `untagged: true`
 *  or as a `tag_id` condition with a null value. */
export const UNTAGGED_ID = -1

/** How several tags are written in one cell of an exported CSV/Excel file. */
export function joinTagNames(tags: { name: string }[] | undefined): string {
  return (tags ?? []).map(t => t.name).join(', ')
}
