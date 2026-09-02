import { test, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import HelpPage from '../HelpPage'

test('renders the guide title and a known section heading', () => {
  renderWithProviders(<HelpPage onBack={() => {}} />)
  expect(screen.getByRole('heading', { name: 'MyFinance User Guide' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Backup & Restore' })).toBeInTheDocument()
})

test('renders the GFM table from the appendix', () => {
  renderWithProviders(<HelpPage onBack={() => {}} />)
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(screen.getByText('Ownership percentages must sum to exactly 100%')).toBeInTheDocument()
})

test('renders the in-page TOC anchor with a GitHub-style slug href', () => {
  renderWithProviders(<HelpPage onBack={() => {}} />)
  const link = screen.getByRole('link', { name: 'Backup & Restore' })
  expect(link).toHaveAttribute('href', '#backup--restore')
})

test('renders the cross-doc relative link as inert text, not a link', () => {
  renderWithProviders(<HelpPage onBack={() => {}} />)
  expect(screen.queryByRole('link', { name: 'data-model.md' })).not.toBeInTheDocument()
  expect(screen.getByText('data-model.md')).toBeInTheDocument()
})

test('back button calls onBack', () => {
  const onBack = vi.fn()
  renderWithProviders(<HelpPage onBack={onBack} />)
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(onBack).toHaveBeenCalled()
})
