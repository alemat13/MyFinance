import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TransactionConditions, { ConditionRow, conditionsToFilters } from '../TransactionConditions'
import { User } from '../../api/client'

const users = [
  { id: 1, name: 'Alex' },
  { id: 2, name: 'Olivia' },
] as User[]

test('a per-user condition carries its user to the API', () => {
  const rows: ConditionRow[] = [
    { field: 'split_balance', operator: 'between', value: '-10', value2: '5.5', userId: '2' },
    { field: 'split_weight', operator: 'eq', value: '0', value2: '', userId: '1' },
    { field: 'amount', operator: 'gt', value: '3', value2: '' },
  ]
  expect(conditionsToFilters(rows)).toEqual([
    { field: 'split_balance', operator: 'between', value: -10, value2: 5.5, user_id: 2 },
    { field: 'split_weight', operator: 'eq', value: 0, value2: undefined, user_id: 1 },
    { field: 'amount', operator: 'gt', value: 3, value2: undefined },
  ])
})

test('a per-user condition with no user is left out', () => {
  expect(conditionsToFilters([{ field: 'split_share', operator: 'gt', value: '1', value2: '' }])).toEqual([])
})

test('a half-typed date or a between missing its second bound is left out', () => {
  const rows: ConditionRow[] = [
    // A date input reports the "2" of 2026 as year 0002.
    { field: 'date', operator: 'after', value: '0002-09-01', value2: '' },
    { field: 'date', operator: 'between', value: '2026-09-01', value2: '' },
    { field: 'date', operator: 'between', value: '2026-09-01', value2: '0020-09-30' },
    { field: 'amount', operator: 'between', value: '1', value2: '' },
    { field: 'amount', operator: 'gt', value: '-', value2: '' },
  ]
  expect(conditionsToFilters(rows)).toEqual([])
  expect(conditionsToFilters([
    { field: 'date', operator: 'between', value: '2026-09-01', value2: '2026-09-30' },
  ])).toEqual([
    { field: 'date', operator: 'between', value: '2026-09-01', value2: '2026-09-30' },
  ])
})

test('picking a per-user field preselects the first user and lets another be chosen', () => {
  const onChange = vi.fn()
  const row: ConditionRow = { field: 'payee', operator: 'contains', value: '', value2: '' }
  const { rerender } = render(
    <TransactionConditions conditions={[row]} onChange={onChange} matchMode="all" onMatchModeChange={() => {}}
                           accounts={[]} categories={[]} users={users} />,
  )
  fireEvent.change(screen.getByDisplayValue('Payee'), { target: { value: 'split_share' } })
  const picked = onChange.mock.calls[0][0][0] as ConditionRow
  expect(picked).toMatchObject({ field: 'split_share', operator: 'eq', userId: '1' })

  rerender(
    <TransactionConditions conditions={[picked]} onChange={onChange} matchMode="all" onMatchModeChange={() => {}}
                           accounts={[]} categories={[]} users={users} />,
  )
  fireEvent.change(screen.getByLabelText('User'), { target: { value: '2' } })
  expect(onChange.mock.calls[1][0][0]).toMatchObject({ field: 'split_share', userId: '2' })
})

test('without users the per-user fields are not offered', () => {
  render(
    <TransactionConditions conditions={[{ field: 'payee', operator: 'contains', value: '', value2: '' }]}
                           onChange={() => {}} matchMode="all" onMatchModeChange={() => {}}
                           accounts={[]} categories={[]} />,
  )
  expect(screen.queryByRole('option', { name: 'Share of' })).toBeNull()
  expect(screen.getByRole('option', { name: 'Amount' })).toBeTruthy()
})

test('Account and Category are sent as "is in" lists, Uncategorized as no category', () => {
  expect(conditionsToFilters([
    { field: 'category_id', operator: 'in', value: '-1,4', value2: '' },
    { field: 'account_id', operator: 'not_in', value: '2,3', value2: '' },
    // Saved before "is in" existed: "is" of one id is "is in" a list of one.
    { field: 'category_id', operator: 'eq', value: '-1', value2: '' },
    { field: 'account_id', operator: 'ne', value: '7', value2: '' },
    // Nothing picked yet: left out.
    { field: 'account_id', operator: 'in', value: '', value2: '' },
  ])).toEqual([
    { field: 'category_id', operator: 'in', value: [null, 4] },
    { field: 'account_id', operator: 'not_in', value: [2, 3] },
    { field: 'category_id', operator: 'in', value: [null] },
    { field: 'account_id', operator: 'not_in', value: [7] },
  ])
})

test('the "(abs)" fields are offered next to their signed ones', () => {
  render(
    <TransactionConditions conditions={[{ field: 'amount_abs', operator: 'gt', value: '100', value2: '' }]}
                           onChange={() => {}} matchMode="all" onMatchModeChange={() => {}}
                           accounts={[]} categories={[]} users={users} />,
  )
  const labels = screen.getAllByRole('option').map(o => o.textContent)
  expect(labels.indexOf('Amount (abs)')).toBe(labels.indexOf('Amount') + 1)
  expect(labels.indexOf('Share of (abs)')).toBe(labels.indexOf('Share of') + 1)
  expect(labels.indexOf('Balance of (abs)')).toBe(labels.indexOf('Balance of') + 1)
  expect(conditionsToFilters([{ field: 'split_balance_abs', operator: 'lt', value: '5', value2: '', userId: '1' }]))
    .toEqual([{ field: 'split_balance_abs', operator: 'lt', value: 5, value2: undefined, user_id: 1 }])
})

test('Reconciled is sent as a boolean, bank fields and dates as typed', () => {
  expect(conditionsToFilters([
    { field: 'reconciled', operator: 'eq', value: 'false', value2: '' },
    { field: 'reconciled', operator: 'eq', value: '', value2: '' },
    { field: 'accounting_month_offset', operator: 'ne', value: '0', value2: '' },
    { field: 'raw_merchant_category_code', operator: 'equals', value: '4112', value2: '' },
    { field: 'created_at', operator: 'after', value: '0002-10-01', value2: '' },
    { field: 'raw_booking_date', operator: 'on', value: '2026-10-01', value2: '' },
  ])).toEqual([
    { field: 'reconciled', operator: 'eq', value: false, value2: undefined },
    { field: 'accounting_month_offset', operator: 'ne', value: 0, value2: undefined },
    { field: 'raw_merchant_category_code', operator: 'equals', value: '4112', value2: undefined },
    { field: 'raw_booking_date', operator: 'on', value: '2026-10-01', value2: undefined },
  ])
})

test('Reconciled picks Yes or No, and rules are not offered Added on', () => {
  const onChange = vi.fn()
  const props = { onChange, matchMode: 'all' as const, onMatchModeChange: vi.fn(), accounts: [], categories: [] }
  const { unmount } = render(<TransactionConditions {...props}
    conditions={[{ field: 'reconciled', operator: 'eq', value: '', value2: '' }]} />)
  fireEvent.change(screen.getByLabelText('Reconciled value'), { target: { value: 'true' } })
  expect(onChange).toHaveBeenCalledWith([{ field: 'reconciled', operator: 'eq', value: 'true', value2: '' }])
  expect(screen.getByRole('option', { name: 'Added on' })).toBeInTheDocument()
  unmount()
  render(<TransactionConditions {...props} forRules conditions={[{ field: 'payee', operator: 'contains', value: '', value2: '' }]} />)
  expect(screen.queryByRole('option', { name: 'Added on' })).toBeNull()
  expect(screen.getByRole('option', { name: 'Booking date' })).toBeInTheDocument()
})
