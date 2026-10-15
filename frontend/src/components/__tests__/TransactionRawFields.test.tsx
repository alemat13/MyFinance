import { test, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import TransactionRawFields from '../TransactionRawFields'
import type { Transaction } from '../../api/client'
import * as api from '../../api/client'

vi.mock('../../api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  updateTransactionRawFields: vi.fn(),
}))

const baseTxn: Transaction = {
  id: 1, date: '2026-01-15', payee: 'Courses de la semaine', memo: null, amount: -42.5,
  account_id: 1, account_name: 'Checking', currency: 'EUR',
  category_id: null, category_name: null,
  accounting_month_offset: 0, accounting_month: '2026-01', reconciled: false,
  divide_group_id: null,
  raw_source: null,
  raw_label: null,
  raw_counterparty: null,
  raw_transaction_code: null,
  raw_merchant_category_code: null,
  raw_merchant_location: null,
  raw_initiated_date: null,
  raw_booking_date: null,
  splits: [],
}

test('renders nothing when the transaction carries no raw field', () => {
  const { container } = renderWithProviders(<TransactionRawFields transaction={baseTxn} />)
  expect(container).toBeEmptyDOMElement()
})

test('shows the original label once expanded, not before', () => {
  renderWithProviders(<TransactionRawFields transaction={{
    ...baseTxn,
    raw_source: 'enable_banking',
    raw_label: 'CB CARREFOUR MARKET 14/01 PARIS 75',
    raw_counterparty: 'CARREFOUR MARKET',
    raw_transaction_code: 'PMNT/CCRD/POSD',
    raw_merchant_category_code: '5411',
  }} />)

  expect(screen.getByText('Bank sync')).toBeInTheDocument()
  expect(screen.queryByText('CB CARREFOUR MARKET 14/01 PARIS 75')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /As reported by the bank/ }))

  expect(screen.getByText('CB CARREFOUR MARKET 14/01 PARIS 75')).toBeInTheDocument()
  expect(screen.getByText('CARREFOUR MARKET')).toBeInTheDocument()
  expect(screen.getByText('Bank transaction code')).toBeInTheDocument()
  expect(screen.getByText('5411')).toBeInTheDocument()
})

test('a Linxo-sourced row labels the code as a transaction type', () => {
  renderWithProviders(<TransactionRawFields transaction={{
    ...baseTxn,
    raw_source: 'linxo_export',
    raw_label: 'CB CARREFOURMARKET 14/01',
    raw_transaction_code: 'PointOfSale',
    raw_merchant_location: 'PARIS 75 FR',
  }} />)

  expect(screen.getByText('Linxo export')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /As reported by the bank/ }))

  expect(screen.getByText('Transaction type')).toBeInTheDocument()
  expect(screen.queryByText('Bank transaction code')).not.toBeInTheDocument()
  expect(screen.getByText('PARIS 75 FR')).toBeInTheDocument()
})

test('omits the rows the source left empty', () => {
  renderWithProviders(<TransactionRawFields transaction={{
    ...baseTxn,
    raw_source: 'enable_banking',
    raw_label: 'VIR SEPA LOYER',
  }} />)

  fireEvent.click(screen.getByRole('button', { name: /As reported by the bank/ }))

  expect(screen.getByText('Original label')).toBeInTheDocument()
  expect(screen.queryByText('Counterparty')).not.toBeInTheDocument()
  expect(screen.queryByText('Merchant category code')).not.toBeInTheDocument()
})

test('renders even when the source is unknown, as long as a field is filled', () => {
  renderWithProviders(<TransactionRawFields transaction={{ ...baseTxn, raw_label: 'LIBELLE BRUT' }} />)
  fireEvent.click(screen.getByRole('button', { name: /As reported by the bank/ }))
  expect(screen.getByText('LIBELLE BRUT')).toBeInTheDocument()
})

test('labels a CSV-imported row with its source', () => {
  renderWithProviders(<TransactionRawFields transaction={{
    ...baseTxn,
    raw_source: 'csv_import',
    raw_label: 'CB CARREFOUR MARKET 14/01',
  }} />)
  expect(screen.getByText('CSV import')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /As reported by the bank/ }))
  expect(screen.getByText('CB CARREFOUR MARKET 14/01')).toBeInTheDocument()
})

test('shows the booking date alongside the purchase date', () => {
  renderWithProviders(<TransactionRawFields transaction={{
    ...baseTxn,
    date: '2026-09-19',
    raw_source: 'enable_banking',
    raw_initiated_date: '2026-09-19',
    raw_booking_date: '2026-09-21',
  }} />)

  fireEvent.click(screen.getByRole('button', { name: /As reported by the bank/ }))

  expect(screen.getByText('Booking date')).toBeInTheDocument()
  expect(screen.getByText('2026-09-21')).toBeInTheDocument()
})

test('admin mode shows the section even when empty, with an Edit button', () => {
  renderWithProviders(<TransactionRawFields transaction={baseTxn} adminMode />)
  expect(screen.getByRole('button', { name: /As reported by the bank/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Edit bank fields' })).toBeInTheDocument()
})

test('no Edit button outside admin mode', () => {
  renderWithProviders(<TransactionRawFields transaction={{ ...baseTxn, raw_label: 'LIBELLE' }} />)
  expect(screen.queryByRole('button', { name: 'Edit bank fields' })).not.toBeInTheDocument()
})

test('admin edit sends only the changed fields, blank as null', async () => {
  const saved = { ...baseTxn, raw_label: 'NOUVEAU', raw_counterparty: null, raw_source: 'csv_import' as const }
  vi.mocked(api.updateTransactionRawFields).mockResolvedValue(saved)
  const onSaved = vi.fn()
  renderWithProviders(
    <TransactionRawFields
      transaction={{ ...baseTxn, raw_label: 'ANCIEN', raw_counterparty: 'SNCF' }}
      adminMode
      actorUserId={7}
      onSaved={onSaved}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit bank fields' }))
  fireEvent.change(screen.getByLabelText('Original label'), { target: { value: 'NOUVEAU' } })
  fireEvent.change(screen.getByLabelText('Counterparty'), { target: { value: '  ' } })
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'csv_import' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save bank fields' }))

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
  expect(api.updateTransactionRawFields).toHaveBeenCalledWith(
    1, { raw_source: 'csv_import', raw_label: 'NOUVEAU', raw_counterparty: null }, 7,
  )
  expect(screen.queryByRole('button', { name: 'Save bank fields' })).not.toBeInTheDocument()
})

test('admin edit with nothing changed sends nothing', () => {
  vi.mocked(api.updateTransactionRawFields).mockClear()
  renderWithProviders(<TransactionRawFields transaction={{ ...baseTxn, raw_label: 'A' }} adminMode />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit bank fields' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save bank fields' }))
  expect(api.updateTransactionRawFields).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Edit bank fields' })).toBeInTheDocument()
})
