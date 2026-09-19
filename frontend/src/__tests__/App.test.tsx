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
  default: (props: { onSelectAccount?: (accountId: number) => void }) => (
    <div>
      DashboardStub
      <button onClick={() => props.onSelectAccount?.(7)}>AccountTile</button>
    </div>
  ),
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
vi.mock('../components/BackupPage', () => ({
  default: () => <div>BackupPageStub</div>,
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

test('clicking a primary nav item switches view and updates the URL', async () => {
  localStorage.setItem('userChoiceMade', '1')
  renderApp()
  await waitFor(() => expect(mockFetchUsers).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Transactions' }))

  expect(screen.getByText('TransactionsPageStub')).toBeInTheDocument()
  expect(window.location.search).toContain('view=transactions')
})

test('clicking More then a secondary view switches view and closes the sheet', async () => {
  localStorage.setItem('userChoiceMade', '1')
  renderApp()
  await waitFor(() => expect(mockFetchUsers).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  fireEvent.click(screen.getByRole('button', { name: 'Backup & Restore' }))

  expect(screen.getByText('BackupPageStub')).toBeInTheDocument()
  expect(window.location.search).toContain('view=backup')
  expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument()
})

test('navigating back to dashboard removes the view param', async () => {
  window.history.replaceState(null, '', '/?view=transactions')
  renderApp()
  await waitFor(() => expect(screen.getByText('TransactionsPageStub')).toBeInTheDocument())

  fireEvent.click(screen.getByText('Back'))

  expect(screen.getByText('DashboardStub')).toBeInTheDocument()
  expect(window.location.search).toBe('')
})

test('clicking a dashboard account tile opens the transactions view filtered on that account', async () => {
  localStorage.setItem('userChoiceMade', '1')
  renderApp()
  await waitFor(() => expect(screen.getByText('DashboardStub')).toBeInTheDocument())

  fireEvent.click(screen.getByText('AccountTile'))

  expect(screen.getByText('TransactionsPageStub')).toBeInTheDocument()
  const params = new URLSearchParams(window.location.search)
  expect(params.get('view')).toBe('transactions')
  expect(params.get('account_id')).toBe('7')
})

test('a dashboard account tile clears filters left over from an earlier transactions visit', async () => {
  localStorage.setItem('userChoiceMade', '1')
  window.history.replaceState(null, '', '/?q=coffee&category_id=3&mode=advanced&page=4')
  renderApp()
  await waitFor(() => expect(screen.getByText('DashboardStub')).toBeInTheDocument())

  fireEvent.click(screen.getByText('AccountTile'))

  const params = new URLSearchParams(window.location.search)
  expect(params.get('account_id')).toBe('7')
  expect(params.get('q')).toBeNull()
  expect(params.get('category_id')).toBeNull()
  expect(params.get('mode')).toBeNull()
  expect(params.get('page')).toBeNull()
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

test('the nav is disabled (and hidden from assistive tech behind the modal) while the first-launch prompt is active, so it cannot be used to bypass it', async () => {
  mockFetchUsers.mockResolvedValue([
    { id: 1, name: 'Alice', email: null, created_at: '2026-01-01' },
  ])
  renderApp()

  await waitFor(() => expect(screen.getByText("Who's using MyFinance?")).toBeInTheDocument())
  // The rest of the app is marked aria-hidden by the modal while it's open (correct,
  // stricter a11y behavior than before), so these are queried with {hidden: true}.
  const transactionsTab = screen.getByRole('button', { name: 'Transactions', hidden: true })
  expect(transactionsTab).toBeDisabled()

  fireEvent.click(transactionsTab)
  expect(screen.queryByText('TransactionsPageStub')).not.toBeInTheDocument()
})

test('does not show "no users yet" while the user list is still loading', async () => {
  let resolveFetch: (users: unknown[]) => void = () => {}
  mockFetchUsers.mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
  renderApp()

  expect(screen.queryByText(/No users yet/)).not.toBeInTheDocument()

  resolveFetch([])
  await waitFor(() => expect(screen.getByText(/No users yet/)).toBeInTheDocument())
})

test('shows a load-failure message instead of "no users yet" when fetching users fails', async () => {
  mockFetchUsers.mockRejectedValue(new Error('network error'))
  renderApp()

  await waitFor(() => expect(screen.getByText(/Couldn't load users/)).toBeInTheDocument())
  expect(screen.queryByText(/No users yet/)).not.toBeInTheDocument()
})
