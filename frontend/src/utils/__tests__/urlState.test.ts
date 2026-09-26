import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { getParam, navigateQueryParams, patchQueryParams } from '../urlState'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

test('getParam reads an existing query param', () => {
  window.history.replaceState(null, '', '/?foo=bar')
  expect(getParam('foo')).toBe('bar')
})

test('getParam returns null for a missing param', () => {
  expect(getParam('missing')).toBeNull()
})

test('patchQueryParams sets a new param without clobbering existing ones', () => {
  window.history.replaceState(null, '', '/?existing=1')
  patchQueryParams({ added: 'value' })
  expect(getParam('existing')).toBe('1')
  expect(getParam('added')).toBe('value')
})

test('patchQueryParams deletes a key when given undefined', () => {
  window.history.replaceState(null, '', '/?a=1&b=2')
  patchQueryParams({ a: undefined })
  expect(getParam('a')).toBeNull()
  expect(getParam('b')).toBe('2')
})

test('patchQueryParams deletes a key when given an empty string', () => {
  window.history.replaceState(null, '', '/?a=1')
  patchQueryParams({ a: '' })
  expect(getParam('a')).toBeNull()
})

test('produces a bare pathname with no trailing ? when all params are removed', () => {
  window.history.replaceState(null, '', '/?a=1')
  patchQueryParams({ a: undefined })
  expect(window.location.search).toBe('')
  expect(window.location.pathname + window.location.search).toBe('/')
})

test('patchQueryParams keeps the current history entry and its state', () => {
  window.history.replaceState({ overlays: ['a'] }, '', '/?a=1')
  const length = window.history.length
  patchQueryParams({ b: '2' })
  expect(window.history.length).toBe(length)
  expect(window.history.state).toEqual({ overlays: ['a'] })
})

test('navigateQueryParams adds a history entry', () => {
  const length = window.history.length
  navigateQueryParams({ view: 'charts' })
  expect(window.history.length).toBe(length + 1)
  expect(getParam('view')).toBe('charts')
})

test('navigateQueryParams reuses an open dialog entry instead of stacking on it', () => {
  window.history.pushState({ overlays: ['sheet'] }, '', '/')
  const length = window.history.length
  navigateQueryParams({ view: 'backup' })
  expect(window.history.length).toBe(length)
  expect(window.history.state).toEqual({ overlays: [] })
  expect(getParam('view')).toBe('backup')
})
