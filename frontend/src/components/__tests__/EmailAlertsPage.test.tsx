import { test, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import EmailAlertsPage from '../EmailAlertsPage'

const { mockFetchUsers, mockFetchEmailAlert, mockUpdateEmailAlert, mockSendTestEmailAlert } = vi.hoisted(() => ({
  mockFetchUsers: vi.fn(),
  mockFetchEmailAlert: vi.fn(),
  mockUpdateEmailAlert: vi.fn(),
  mockSendTestEmailAlert: vi.fn(),
}))

vi.mock('../../api/client', () => ({
  fetchUsers: mockFetchUsers,
  fetchEmailAlert: mockFetchEmailAlert,
  updateEmailAlert: mockUpdateEmailAlert,
  sendTestEmailAlert: mockSendTestEmailAlert,
}))

const users = [
  { id: 1, name: 'Alex', email: 'alex@example.com', created_at: '2026-01-01T00:00:00' },
  { id: 2, name: 'Olivia', email: null, created_at: '2026-01-01T00:00:00' },
]

const alertFor = (userId: number, overrides = {}) => ({
  user_id: userId,
  email: userId === 1 ? 'alex@example.com' : null,
  daily: false,
  weekly: false,
  monthly: false,
  last_daily_sent_at: null,
  last_weekly_sent_at: null,
  last_monthly_sent_at: null,
  last_status: null,
  last_error: null,
  sending_configured: true,
  from_address: 'myfinance@olivex.fr',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchUsers.mockResolvedValue(users)
  mockFetchEmailAlert.mockImplementation((id: number) => Promise.resolve(alertFor(id)))
})

test('shows one card per user, or only the selected one', async () => {
  const { unmount } = renderWithProviders(<EmailAlertsPage onBack={() => {}} selectedUserId={null} />)
  expect(await screen.findByRole('heading', { name: 'Alex' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Olivia' })).toBeInTheDocument()
  expect(screen.getByText('myfinance@olivex.fr')).toBeInTheDocument()
  unmount()

  renderWithProviders(<EmailAlertsPage onBack={() => {}} selectedUserId={2} />)
  expect(await screen.findByRole('heading', { name: 'Olivia' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Alex' })).not.toBeInTheDocument()
})

test('saves the address and the ticked frequencies', async () => {
  mockUpdateEmailAlert.mockResolvedValue(alertFor(1, { daily: true, monthly: true, email: 'me@olivex.fr' }))
  renderWithProviders(<EmailAlertsPage onBack={() => {}} selectedUserId={1} />)
  const email = await screen.findByLabelText('Send to')
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  fireEvent.change(email, { target: { value: ' me@olivex.fr ' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Daily/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Monthly/ }))
  // Unsaved changes: the test email would go out with the old settings.
  expect(screen.getByRole('button', { name: 'Send a test email' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(mockUpdateEmailAlert).toHaveBeenCalledWith(1, {
    email: 'me@olivex.fr', daily: true, weekly: false, monthly: true,
  }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())
})

test('sends a test email', async () => {
  mockSendTestEmailAlert.mockResolvedValue({ sent_to: 'alex@example.com', transaction_count: 3 })
  renderWithProviders(<EmailAlertsPage onBack={() => {}} selectedUserId={1} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Send a test email' }))
  await waitFor(() => expect(mockSendTestEmailAlert).toHaveBeenCalledWith(1))
  expect(await screen.findByText(/Test email sent to alex@example.com \(3 transactions/)).toBeInTheDocument()
})

test('warns when sending is not configured and shows the last failure', async () => {
  mockFetchEmailAlert.mockResolvedValue(alertFor(1, {
    daily: true, last_status: 'failed', last_error: 'Daily alert: connection refused', sending_configured: false,
  }))
  renderWithProviders(<EmailAlertsPage onBack={() => {}} selectedUserId={1} />)
  expect(await screen.findByText(/isn't set up on the server yet/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send a test email' })).toBeDisabled()
  const card = screen.getByRole('heading', { name: 'Alex' }).parentElement as HTMLElement
  expect(within(card).getByText(/Last send failed: Daily alert: connection refused/)).toBeInTheDocument()
})
