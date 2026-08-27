import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../App'
import { ThemeProvider } from '../context/ThemeContext'
import { ToastProvider } from '../context/ToastContext'

const { mockFetchUsers } = vi.hoisted(() => ({
  mockFetchUsers: vi.fn(),
}))

vi.mock('../api/client', () => ({
  fetchUsers: mockFetchUsers,
}))

vi.mock('../components/Dashboard', () => ({
  default: () => <div>DashboardStub</div>,
}))
vi.mock('../components/AccountsList', () => ({
  default: () => <div>AccountsListStub</div>,
}))
vi.mock('../components/CategoriesList', () => ({
  default: () => <div>CategoriesListStub</div>,
}))
vi.mock('../components/TransactionsPage', () => ({
  default: (props: { onBack: () => void }) => (
    <div>
      TransactionsPageStub
      <button onClick={props.onBack}>Back</button>
    </div>
  ),
}))
vi.mock('../components/UsersList', () => ({
  default: () => <div>UsersListStub</div>,
}))
vi.mock('../components/SplitWeightsSettings', () => ({
  default: () => <div>SplitWeightsSettingsStub</div>,
}))
vi.mock('../components/CsvImportPage', () => ({
  default: () => <div>CsvImportPageStub</div>,
}))

function renderApp() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchUsers.mockResolvedValue([])
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

test('defaults to the dashboard view with no view param', async () => {
  renderApp()
  await waitFor(() => expect(screen.getByText('DashboardStub')).toBeInTheDocument())
})

test('mounting with ?view=transactions renders TransactionsPage directly', async () => {
  window.history.replaceState(null, '', '/?view=transactions')
  renderApp()
  await waitFor(() => expect(screen.getByText('TransactionsPageStub')).toBeInTheDocument())
})

test('clicking a menu item switches view and updates the URL', async () => {
  renderApp()
  await waitFor(() => expect(mockFetchUsers).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByText('Transactions'))

  expect(screen.getByText('TransactionsPageStub')).toBeInTheDocument()
  expect(window.location.search).toContain('view=transactions')
})

test('navigating back to dashboard removes the view param', async () => {
  window.history.replaceState(null, '', '/?view=transactions')
  renderApp()
  await waitFor(() => expect(screen.getByText('TransactionsPageStub')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Back'))

  expect(screen.getByText('DashboardStub')).toBeInTheDocument()
  expect(window.location.search).toBe('')
})

test('shows a mandatory first-launch prompt when no user has been chosen yet, and picking one dismisses it', async () => {
  mockFetchUsers.mockResolvedValue([
    { id: 1, name: 'Alice', email: null, created_at: '2026-01-01' },
  ])
  renderApp()

  await waitFor(() => expect(screen.getByText("Who's using MyFinance?")).toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: 'Alice' }))

  await waitFor(() => expect(screen.queryByText("Who's using MyFinance?")).not.toBeInTheDocument())
  expect(localStorage.getItem('selectedUserId')).toBe('1')
  expect(localStorage.getItem('userChoiceMade')).toBe('1')
})

test('does not show the first-launch prompt again once a user has already been chosen', async () => {
  localStorage.setItem('userChoiceMade', '1')
  mockFetchUsers.mockResolvedValue([
    { id: 1, name: 'Alice', email: null, created_at: '2026-01-01' },
  ])
  renderApp()

  await waitFor(() => expect(mockFetchUsers).toHaveBeenCalled())
  expect(screen.queryByText("Who's using MyFinance?")).not.toBeInTheDocument()
})

test('first-launch prompt cannot be dismissed via Escape', async () => {
  mockFetchUsers.mockResolvedValue([
    { id: 1, name: 'Alice', email: null, created_at: '2026-01-01' },
  ])
  renderApp()

  await waitFor(() => expect(screen.getByText("Who's using MyFinance?")).toBeInTheDocument())
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByText("Who's using MyFinance?")).toBeInTheDocument()
})
