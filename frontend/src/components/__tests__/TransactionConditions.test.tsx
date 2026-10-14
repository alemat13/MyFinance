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
