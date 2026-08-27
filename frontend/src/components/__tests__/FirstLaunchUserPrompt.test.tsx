import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FirstLaunchUserPrompt from '../FirstLaunchUserPrompt'

test('renders a button per user and calls onChoose when clicked', () => {
  const onChoose = vi.fn()
  const users = [
    { id: 1, name: 'Alice', email: null, created_at: '2026-01-01' },
    { id: 2, name: 'Bob', email: null, created_at: '2026-01-01' },
  ]

  render(<FirstLaunchUserPrompt users={users} onChoose={onChoose} />)

  fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
  expect(onChoose).toHaveBeenCalledWith(2)
})

test('shows a message and no user buttons when there are no users yet', () => {
  render(<FirstLaunchUserPrompt users={[]} onChoose={vi.fn()} />)

  expect(screen.getByText(/No users yet/)).toBeInTheDocument()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})

test('shows a load-failure message instead of "no users yet" when loadError is set', () => {
  render(<FirstLaunchUserPrompt users={[]} loadError onChoose={vi.fn()} />)

  expect(screen.getByText(/Couldn't load users/)).toBeInTheDocument()
  expect(screen.queryByText(/No users yet/)).not.toBeInTheDocument()
})
