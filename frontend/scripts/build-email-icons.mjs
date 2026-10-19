// Rasterises the category icons (utils/categoryIcons.ts) into the alpha masks
// the email alerts use (backend/email_icons.json). Email clients don't render
// SVG, so the backend draws each icon as a PNG in its category's colour from
// these masks. Re-run after changing the icon list:
//   cd frontend && node scripts/build-email-icons.mjs
// It needs Playwright's Chromium, installed in e2e/ (see CLAUDE.md).
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as lucide from 'lucide-react'

const SIZE = 32 // pixels: shown at 16 CSS px, so sharp on a 2x phone screen
const source = readFileSync(new URL('../src/utils/categoryIcons.ts', import.meta.url), 'utf8')
const names = source.match(/^export const CATEGORY_ICONS[^{]*\{([^}]*)\}/m)[1]
  .split(',').map(s => s.trim()).filter(Boolean)
names.push('HelpCircle') // DEFAULT_CATEGORY_ICON, for no icon or an unknown one

const require = createRequire(new URL('../../e2e/package.json', import.meta.url))
const { chromium } = require('playwright')
const browser = await chromium.launch()
const page = await browser.newPage()
const icons = {}
for (const name of names) {
  const svg = renderToStaticMarkup(createElement(lucide[name], { size: SIZE, color: '#000', strokeWidth: 2 }))
  const alpha = await page.evaluate(async ({ svg, size }) => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,' + btoa(svg)
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    return Array.from({ length: size * size }, (_, i) => data[i * 4 + 3])
  }, { svg, size: SIZE })
  icons[name] = deflateSync(Buffer.from(alpha), { level: 9 }).toString('base64')
}
await browser.close()
const out = new URL('../../backend/email_icons.json', import.meta.url)
writeFileSync(out, JSON.stringify({ size: SIZE, default: 'HelpCircle', icons }, null, 0) + '\n')
console.log(`${names.length} icons written to backend/email_icons.json`)
