import { ReactElement } from 'react'
import { fireEvent, render, RenderResult, screen, within } from '@testing-library/react'
import { ToastProvider } from './context/ToastContext'

export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

/** Picks an account in an AccountPicker: opens it from its trigger, searches for
 *  the name (collapsed sub-menus don't render their accounts) and clicks it. */
export function pickAccount(trigger: HTMLElement, name: string) {
  fireEvent.click(trigger)
  fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: name } })
  fireEvent.click(within(screen.getByRole('listbox', { name: 'Accounts' })).getByRole('option', { name }))
}
