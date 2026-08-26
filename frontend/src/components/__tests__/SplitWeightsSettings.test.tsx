import { describe, test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import SplitWeightsSettings from '../SplitWeightsSettings'

const { mockFetchSplitWeights, mockUpdateSplitWeights } = vi.hoisted(() => ({
  mockFetchSplitWeights: vi.fn(),
  mockUpdateSplitWeights: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchSplitWeights: mockFetchSplitWeights,
  updateSplitWeights: mockUpdateSplitWeights,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

test('shows loading initially', () => {
  mockFetchSplitWeights.mockReturnValue(new Promise(() => {}))

  renderWithProviders(<SplitWeightsSettings onBack={() => {}} />)

  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

test('renders weights from API', async () => {
  mockFetchSplitWeights.mockResolvedValue([
    { user_id: 1, user_name: 'Alex', weight: 52000 },
    { user_id: 2, user_name: 'Olivia', weight: 48000 },
  ])

  renderWithProviders(<SplitWeightsSettings onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByDisplayValue('52000')).toBeInTheDocument()
  })
})

test('can edit and save weights', async () => {
  mockFetchSplitWeights.mockResolvedValue([{ user_id: 1, user_name: 'Alex', weight: 100 }])
  mockUpdateSplitWeights.mockResolvedValue([{ user_id: 1, user_name: 'Alex', weight: 200 }])

  renderWithProviders(<SplitWeightsSettings onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '200' } })
  fireEvent.click(screen.getByText('Save'))

  await waitFor(() => {
    expect(mockUpdateSplitWeights).toHaveBeenCalledWith([{ user_id: 1, weight: 200 }])
  })
})

test('shows empty message when no users', async () => {
  mockFetchSplitWeights.mockResolvedValue([])

  renderWithProviders(<SplitWeightsSettings onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('No users yet')).toBeInTheDocument()
  })
})

test('shows error state on fetch failure', async () => {
  mockFetchSplitWeights.mockRejectedValue(new Error('Failed to load'))

  renderWithProviders(<SplitWeightsSettings onBack={() => {}} />)

  await waitFor(() => {
    expect(screen.getByText('Error: Failed to load')).toBeInTheDocument()
  })
})
