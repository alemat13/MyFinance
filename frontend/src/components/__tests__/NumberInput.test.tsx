import { test, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { NumberInput, parseNumber } from '../ui'

function Harness({ initial = 0, onValue, ...props }: { initial?: number | null; onValue?: (v: number | null) => void; integer?: boolean; signed?: boolean }) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <>
      <NumberInput aria-label="n" value={value} onValueChange={v => { setValue(v ?? 0); onValue?.(v) }} {...props} />
      <button onClick={() => setValue(42)}>set</button>
    </>
  )
}

const field = () => screen.getByLabelText('n') as HTMLInputElement

test('parseNumber reads "." and "," as the decimal separator and ignores spaces', () => {
  expect(parseNumber('12.5')).toBe(12.5)
  expect(parseNumber('12,5')).toBe(12.5)
  expect(parseNumber('1 250,50')).toBe(1250.5)
  expect(parseNumber('-3,')).toBe(-3)
  expect(parseNumber('')).toBeNull()
  expect(parseNumber('-')).toBeNull()
})

test('typing a "." keeps it on screen instead of resetting the field to 0', () => {
  const onValue = vi.fn()
  render(<Harness signed onValue={onValue} />)
  fireEvent.change(field(), { target: { value: '12.' } })
  expect(field().value).toBe('12.')
  fireEvent.change(field(), { target: { value: '12.3' } })
  expect(field().value).toBe('12.3')
  expect(onValue).toHaveBeenLastCalledWith(12.3)
})

test('a "," works as the decimal separator too', () => {
  const onValue = vi.fn()
  render(<Harness onValue={onValue} />)
  fireEvent.change(field(), { target: { value: '7,25' } })
  expect(field().value).toBe('7,25')
  expect(onValue).toHaveBeenLastCalledWith(7.25)
})

test('the prefilled 0 can be deleted, leaving the field empty', () => {
  render(<Harness />)
  expect(field().value).toBe('0')
  fireEvent.change(field(), { target: { value: '' } })
  expect(field().value).toBe('')
})

test('letters and a minus on an unsigned field are refused', () => {
  render(<Harness />)
  fireEvent.change(field(), { target: { value: '5' } })
  fireEvent.change(field(), { target: { value: '5a' } })
  fireEvent.change(field(), { target: { value: '-5' } })
  expect(field().value).toBe('5')
})

test('an integer field refuses a decimal separator', () => {
  render(<Harness integer />)
  fireEvent.change(field(), { target: { value: '3' } })
  fireEvent.change(field(), { target: { value: '3.' } })
  expect(field().value).toBe('3')
})

test('follows a value set from outside', () => {
  render(<Harness />)
  fireEvent.change(field(), { target: { value: '' } })
  fireEvent.click(screen.getByText('set'))
  expect(field().value).toBe('42')
})
