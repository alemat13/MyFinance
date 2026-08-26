import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { getParam, patchQueryParams } from '../urlState'

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
