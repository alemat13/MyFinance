import { ReactElement } from 'react'
import { render, RenderResult } from '@testing-library/react'
import { ToastProvider } from './context/ToastContext'

export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<ToastProvider>{ui}</ToastProvider>)
}
