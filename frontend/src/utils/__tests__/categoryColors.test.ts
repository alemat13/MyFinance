import { describe, expect, it } from 'vitest'
import { categoryShades, shadeColor } from '../categoryColors'

describe('shadeColor', () => {
  it('mixes towards white or black', () => {
    expect(shadeColor('#db2777', 0)).toBe('#db2777')
    expect(shadeColor('#db2777', 1)).toBe('#ffffff')
    expect(shadeColor('#db2777', -1)).toBe('#000000')
    expect(shadeColor('#808080', 0.5)).toBe('#c0c0c0')
  })

  it('leaves a non-hex colour alone', () => {
    expect(shadeColor('var(--x)', 0.5)).toBe('var(--x)')
  })
})

describe('categoryShades', () => {
  it('gives the parent colour itself to a lone subcategory', () => {
    expect(categoryShades('#db2777', 1)).toEqual(['#db2777'])
    expect(categoryShades('#db2777', 0)).toEqual([])
  })

  it('gives every subcategory its own shade, darkest first', () => {
    const shades = categoryShades('#db2777', 8)
    expect(new Set(shades).size).toBe(8)
    const lum = (c: string) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16)
    for (let i = 1; i < shades.length; i++) expect(lum(shades[i])).toBeGreaterThan(lum(shades[i - 1]))
  })
})
