import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import AccountPicker from '../AccountPicker'
import { Account } from '../../api/client'

const acct = (id: number, name: string, type: string, archived = false): Account => ({
  id, name, type, archived, balance: 0, currency: 'EUR', created_at: '', users: [], split_weights: [],
})

const accounts = [
  acct(1, 'Livret A', 'Épargne'),
  acct(2, 'Compte joint', 'Courant'),
  acct(3, 'Assurance vie', 'Épargne'),
  acct(4, 'Compte perso', 'courant '),
  acct(5, 'Vieux PEL', 'Épargne', true),
  acct(6, 'Ancien compte', 'Courant', true),
  acct(7, 'Ancien CEL', 'Épargne', true),
]

function open(props: Partial<Parameters<typeof AccountPicker>[0]> = {}) {
  const onChange = vi.fn()
  render(<AccountPicker accounts={accounts} value={null} onChange={onChange} placeholder="All accounts" {...props} />)
  fireEvent.click(screen.getAllByRole('button')[0])
  return { onChange, listbox: screen.getByRole('listbox', { name: 'Accounts' }) }
}

const optionNames = (el: HTMLElement) => within(el).queryAllByRole('option').map(o => o.textContent)

test('shows one collapsed sub-menu per account type, alphabetically, then an Archived one', () => {
  const { listbox } = open()

  const headers = within(listbox).getAllByRole('button', { expanded: false }).map(b => b.textContent)
  // "Courant" and "courant " are one type; counts are per sub-menu.
  expect(headers).toEqual(['Courant2', 'Épargne2', 'Archived3'])
  expect(optionNames(listbox)).toEqual(['All accounts'])
})

test('a sub-menu lists its accounts alphabetically', () => {
  const { listbox } = open()

  fireEvent.click(within(listbox).getByRole('button', { name: /Épargne/ }))

  expect(optionNames(listbox)).toEqual(['All accounts', 'Assurance vie', 'Livret A'])
})

test('the Archived sub-menu sorts by type, then name, with a separator per type', () => {
  const { listbox } = open()

  fireEvent.click(within(listbox).getByRole('button', { name: /Archived/ }))

  expect(within(listbox).getAllByRole('separator').map(s => s.textContent)).toEqual(['Courant', 'Épargne'])
  expect(optionNames(listbox)).toEqual(['All accounts', 'Ancien compte', 'Ancien CEL', 'Vieux PEL'])
})

test('opens on the sub-menu holding the current account', () => {
  const { listbox } = open({ value: 5 })

  expect(within(listbox).getByRole('option', { name: 'Vieux PEL' })).toHaveAttribute('aria-selected', 'true')
  expect(within(listbox).queryByRole('option', { name: 'Livret A' })).not.toBeInTheDocument()
})

test('searching matches across every sub-menu, archived included', () => {
  const { listbox } = open()

  fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'ancien' } })

  expect(optionNames(listbox)).toEqual(['Ancien compte', 'Ancien CEL'])
})

test('searching also matches the account type', () => {
  const { listbox } = open()

  fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: 'courant' } })

  expect(optionNames(listbox)).toEqual(['Compte joint', 'Compte perso', 'Ancien compte'])
})

test('picking an account reports it and closes the menu; Enter picks the first match', () => {
  const { onChange, listbox } = open()

  fireEvent.click(within(listbox).getByRole('button', { name: /Courant/ }))
  fireEvent.click(within(listbox).getByRole('option', { name: 'Compte perso' }))
  expect(onChange).toHaveBeenCalledWith(4)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'All accounts' }))
  const search = screen.getByLabelText('Search accounts')
  fireEvent.change(search, { target: { value: 'livret' } })
  fireEvent.keyDown(search, { key: 'Enter' })
  expect(onChange).toHaveBeenLastCalledWith(1)
})

test('the placeholder clears the selection, unless empty is not allowed', () => {
  const { onChange, listbox } = open({ value: 1 })
  fireEvent.click(within(listbox).getByRole('option', { name: 'All accounts' }))
  expect(onChange).toHaveBeenCalledWith(null)
})

test('without allowEmpty there is no placeholder choice', () => {
  const { listbox } = open({ allowEmpty: false })
  expect(within(listbox).queryByRole('option', { name: 'All accounts' })).not.toBeInTheDocument()
})

test('no Archived sub-menu when nothing is archived', () => {
  const { listbox } = open({ accounts: accounts.filter(a => !a.archived) })
  expect(within(listbox).queryByText('Archived')).not.toBeInTheDocument()
})
