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
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
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
