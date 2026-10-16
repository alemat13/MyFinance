import { test, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import NetIncomeByMonthChart from '../NetIncomeByMonthChart'

const byMonth = [
  { month: '2026-01', income: 1000, expense: -300, uncategorized: 0, currency: 'EUR' },
  { month: '2026-02', income: 500, expense: -900, uncategorized: 0, currency: 'EUR' },
  { month: '2026-03', income: 1200, expense: -200, uncategorized: 0, currency: 'EUR' },
]
const netByMonth = [
  { month: '2026-01', net: 700, currency: 'EUR' },
  { month: '2026-02', net: -400, currency: 'EUR' },
  { month: '2026-03', net: 1000, currency: 'EUR' },
]

function rowFor(month: string) {
  const table = screen.getByRole('table', { name: 'Net income per month summary' })
  return within(table).getByText(month).closest('tr') as HTMLElement
}

test('lists every month with income, expense and net, plus the average', () => {
  render(
    <NetIncomeByMonthChart byMonth={byMonth} netByMonth={netByMonth} startMonth="2026-01" endMonth="2026-03" currency="EUR" />
  )
  const jan = rowFor('2026-01')
  expect(jan).toHaveTextContent('1,000.00')
  expect(jan).toHaveTextContent('300.00')
  expect(jan).toHaveTextContent('700.00')

  const avg = rowFor('Average')
  // (700 - 400 + 1000) / 3
  expect(avg).toHaveTextContent('433.33')
  // Uncategorized column only appears when some month has any.
  expect(screen.queryByRole('columnheader', { name: 'Uncategorized' })).not.toBeInTheDocument()
})

test('marks the best and the worst net month', () => {
  render(
    <NetIncomeByMonthChart byMonth={byMonth} netByMonth={netByMonth} startMonth="2026-01" endMonth="2026-03" currency="EUR" />
  )
  expect(within(rowFor('2026-03')).getByRole('img', { name: 'Best month' })).toBeInTheDocument()
  expect(within(rowFor('2026-02')).getByRole('img', { name: 'Worst month' })).toBeInTheDocument()
  expect(within(rowFor('2026-01')).queryByRole('img')).not.toBeInTheDocument()
})

test('counts a month with no data as zero and shows no marker when all months are equal', () => {
  render(
    <NetIncomeByMonthChart
      byMonth={[{ month: '2026-01', income: 0, expense: 0, uncategorized: 0, currency: 'EUR' }]}
      netByMonth={[{ month: '2026-01', net: 0, currency: 'EUR' }]}
      startMonth="2026-01" endMonth="2026-02" currency="EUR"
    />
  )
  expect(rowFor('2026-02')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'Best month' })).not.toBeInTheDocument()
})
