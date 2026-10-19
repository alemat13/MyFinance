import { InputHTMLAttributes, useEffect, useState } from 'react'
import { Input } from './Input'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: number | null | undefined
  /** null while the field is empty (or holds only "-"). */
  onValueChange: (value: number | null) => void
  /** Whole numbers only: no decimal separator accepted. */
  integer?: boolean
  /** Allows a leading "-". */
  signed?: boolean
}

/** Turns what the user typed into a number, accepting "," as well as "." as
 *  the decimal separator (a French keypad types one, a French keyboard the
 *  other). Spaces are ignored so "1 250,50" reads as 1250.5. */
export function parseNumber(text: string): number | null {
  const n = parseFloat(text.replace(/[\s  ]/g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

// iOS has no decimal keypad with a minus key, so a field that takes negative
// numbers falls back to the full keyboard there.
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

/**
 * A text field for numbers, in place of `<input type="number">`: Chrome's
 * number input follows the browser locale, so in French it refuses the "." a
 * numeric keypad types and reports the field as empty, which the forms used to
 * turn back into 0; and it gives no way to clear a prefilled 0. This keeps what
 * the user typed as is (an empty field, a trailing separator) and only reports
 * the number it reads as.
 */
export function NumberInput({ value, onValueChange, integer = false, signed = false, ...rest }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value))

  // Follow a value set from outside (a quick-fill button, a reset), but not
  // the echo of what was just typed: "" reads as both null and 0, so clearing
  // a field whose parent keeps 0 leaves it empty.
  useEffect(() => {
    const typed = parseNumber(text)
    const same = typed === null ? value == null || value === 0 : typed === value
    if (!same) setText(value == null ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const pattern = integer
    ? (signed ? /^-?\d*$/ : /^\d*$/)
    : (signed ? /^-?\d*[.,]?\d*$/ : /^\d*[.,]?\d*$/)

  return (
    <Input
      type="text"
      inputMode={integer && !signed ? 'numeric' : signed && isIOS ? 'text' : 'decimal'}
      autoComplete="off"
      value={text}
      onChange={e => {
        const next = e.target.value.replace(/[\s  ]/g, '')
        if (!pattern.test(next)) return
        setText(next)
        onValueChange(parseNumber(next))
      }}
      {...rest}
    />
  )
}
