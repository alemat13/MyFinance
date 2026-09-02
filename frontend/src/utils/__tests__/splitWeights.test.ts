import { test, expect } from 'vitest'
import { prorateWeights, resolveDefaultSplitRows } from '../splitWeights'
import { Account, Category, GlobalSplitWeight } from '../../api/client'

test('prorateWeights returns [] for no rows', () => {
  expect(prorateWeights(100, [])).toEqual([])
})

test('prorateWeights normal weighted split', () => {
  const shares = prorateWeights(100, [{ user_id: 1, weight: 60 }, { user_id: 2, weight: 40 }])
  expect(shares).toEqual([{ user_id: 1, share_amount: 60 }, { user_id: 2, share_amount: 40 }])
})

test('prorateWeights rounding remainder goes to the highest user_id', () => {
  const shares = prorateWeights(100, [{ user_id: 1, weight: 1 }, { user_id: 2, weight: 1 }, { user_id: 3, weight: 1 }])
  const byUser = Object.fromEntries(shares.map(s => [s.user_id, s.share_amount]))
  expect(byUser[1]).toBe(33.33)
  expect(byUser[2]).toBe(33.33)
  expect(byUser[3]).toBe(33.34)
})

test('prorateWeights all-zero weights returns explicit zero shares, not dropped', () => {
  const shares = prorateWeights(100, [{ user_id: 1, weight: 0 }, { user_id: 2, weight: 0 }])
  expect(shares).toEqual([{ user_id: 1, share_amount: 0 }, { user_id: 2, share_amount: 0 }])
})

const user1 = { user_id: 1, user_name: 'Alex' }
const user2 = { user_id: 2, user_name: 'Olivia' }

const baseCategory: Category = { id: 1, name: 'Groceries', type: 'Expense', splits: [] }
const baseAccount: Account = { id: 1, name: 'Checking', type: 'Checking', balance: 0, currency: 'EUR', created_at: '', users: [], split_weights: [] }
const noGlobalWeights: GlobalSplitWeight[] = []

test('resolveDefaultSplitRows returns none when nothing configured', () => {
  expect(resolveDefaultSplitRows(baseCategory, baseAccount, noGlobalWeights)).toEqual({ rows: [], source: null })
})

test('resolveDefaultSplitRows falls back to global when nothing else configured', () => {
  const globalWeights: GlobalSplitWeight[] = [{ ...user1, weight: 60 }, { ...user2, weight: 40 }]
  const result = resolveDefaultSplitRows(baseCategory, baseAccount, globalWeights)
  expect(result.source).toBe('global')
  expect(result.rows).toEqual([{ user_id: 1, value: 60 }, { user_id: 2, value: 40 }])
})

test('resolveDefaultSplitRows ignores non-positive global weights', () => {
  const globalWeights: GlobalSplitWeight[] = [{ ...user1, weight: 0 }, { ...user2, weight: 0 }]
  expect(resolveDefaultSplitRows(baseCategory, baseAccount, globalWeights)).toEqual({ rows: [], source: null })
})

test('resolveDefaultSplitRows account takes precedence over global', () => {
  const account: Account = { ...baseAccount, split_weights: [{ ...user1, weight: 70 }, { ...user2, weight: 30 }] }
  const globalWeights: GlobalSplitWeight[] = [{ ...user1, weight: 90 }, { ...user2, weight: 10 }]
  const result = resolveDefaultSplitRows(baseCategory, account, globalWeights)
  expect(result.source).toBe('account')
  expect(result.rows).toEqual([{ user_id: 1, value: 70 }, { user_id: 2, value: 30 }])
})

test('resolveDefaultSplitRows category takes precedence over account and global', () => {
  const category: Category = { ...baseCategory, splits: [{ ...user1, weight: 50 }, { ...user2, weight: 50 }] }
  const account: Account = { ...baseAccount, split_weights: [{ ...user1, weight: 70 }, { ...user2, weight: 30 }] }
  const globalWeights: GlobalSplitWeight[] = [{ ...user1, weight: 90 }, { ...user2, weight: 10 }]
  const result = resolveDefaultSplitRows(category, account, globalWeights)
  expect(result.source).toBe('category')
  expect(result.rows).toEqual([{ user_id: 1, value: 50 }, { user_id: 2, value: 50 }])
})

test('resolveDefaultSplitRows handles null category/account', () => {
  const globalWeights: GlobalSplitWeight[] = [{ ...user1, weight: 1 }]
  const result = resolveDefaultSplitRows(null, null, globalWeights)
  expect(result.source).toBe('global')
  expect(result.rows).toEqual([{ user_id: 1, value: 1 }])
})
