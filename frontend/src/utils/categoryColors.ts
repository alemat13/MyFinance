export const CATEGORY_COLOR_PALETTE = [
  '#16a34a', // positive green
  '#dc2626', // negative red
  '#d97706', // warning amber
  '#0891b2', // info cyan
  '#4f46e5', // accent indigo
  '#ea580c', // orange
  '#7c3aed', // violet
  '#db2777', // pink
  '#0d9488', // teal
  '#65a30d', // lime
  '#2563eb', // blue
  '#78716c', // stone
]

export const UNCATEGORIZED_COLOR = '#94a3b8' // slate-400

export const DEFAULT_CATEGORY_COLOR = '#64748b' // slate-500, used when a category has no color set

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')

// `color` mixed with white (t > 0) or black (t < 0), |t| in [0, 1].
export function shadeColor(color: string, t: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!m) return color
  const target = t > 0 ? 255 : 0
  const k = Math.abs(t)
  return '#' + m.slice(1, 4).map(h => hex2(parseInt(h, 16) * (1 - k) + target * k)).join('')
}

// Charts only (MYF-87): a subcategory shows its parent's colour everywhere,
// but a chart split by subcategory needs them apart. `n` shades of `base`,
// darkest first, evenly spaced from a deeper tone to a pale tint and
// centred on `base` itself, so the family stays recognisable and each
// segment matches one legend entry (a two-shade alternation, Linxo's way,
// reads fine in a stacked bar but leaves the legend ambiguous).
export function categoryShades(base: string, n: number): string[] {
  if (n <= 1) return n === 1 ? [base] : []
  const DARKEST = -0.35
  const LIGHTEST = 0.7
  const step = Math.min(0.22, (LIGHTEST - DARKEST) / (n - 1))
  const start = Math.max(DARKEST, 0.15 - (step * (n - 1)) / 2)
  return Array.from({ length: n }, (_, i) => shadeColor(base, start + i * step))
}
