import { test, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Modal } from '../../components/ui'

function waitForPopState() {
  return new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }))
}

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <Modal isOpen={open} onClose={() => { setOpen(false); onClose?.() }} title="Outer">
        <button onClick={() => setInner(true)}>open inner</button>
        <button onClick={() => { setInner(false); setOpen(false) }}>close both</button>
        <Modal isOpen={inner} onClose={() => setInner(false)} title="Inner">inner body</Modal>
      </Modal>
    </>
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

test('opening a modal adds a history entry and back closes it', async () => {
  const onClose = vi.fn()
  render(<Harness onClose={onClose} />)
  const length = window.history.length
  fireEvent.click(screen.getByText('open'))
  expect(window.history.length).toBe(length + 1)

  const popped = waitForPopState()
  act(() => window.history.back())
  await popped
  await waitFor(() => expect(screen.queryByText('Outer')).not.toBeInTheDocument())
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('back closes only the topmost of two nested modals', async () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('open'))
  fireEvent.click(screen.getByText('open inner'))
  expect(screen.getByText('inner body')).toBeInTheDocument()

  const popped = waitForPopState()
  act(() => window.history.back())
  await popped
  await waitFor(() => expect(screen.queryByText('inner body')).not.toBeInTheDocument())
  expect(screen.getByText('Outer')).toBeInTheDocument()
})

test('closing a modal from the UI goes back over its entry', async () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('open'))
  expect(window.history.state?.overlays).toHaveLength(1)

  const popped = waitForPopState()
  fireEvent.click(screen.getByLabelText('Close'))
  await popped
  expect(window.history.state?.overlays ?? []).toHaveLength(0)
})

test('closing nested modals together goes back over both entries at once', async () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('open'))
  fireEvent.click(screen.getByText('open inner'))
  expect(window.history.state?.overlays).toHaveLength(2)

  const popped = waitForPopState()
  fireEvent.click(screen.getByText('close both'))
  await popped
  expect(window.history.state?.overlays ?? []).toHaveLength(0)
  expect(screen.queryByText('Outer')).not.toBeInTheDocument()
})

test('query params changed while a modal was open survive its closing', async () => {
  window.history.replaceState(null, '', '/?transaction=5')
  render(<Harness />)
  fireEvent.click(screen.getByText('open'))
  window.history.replaceState(window.history.state, '', '/')

  const popped = waitForPopState()
  fireEvent.click(screen.getByLabelText('Close'))
  await popped
  await waitFor(() => expect(window.location.search).toBe(''))
})
