import { useEffect, useId, useRef } from 'react'
import { isOverlayOpen, pushOverlay, releaseOverlay } from '../utils/navHistory'

// While `isOpen`, the browser/Android back button calls `onClose` instead of
// leaving the page. See utils/navHistory.ts.
export function useBackToClose(isOpen: boolean, onClose: () => void) {
  const id = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return
    pushOverlay(id)
    const onPopState = () => {
      if (!isOverlayOpen(id)) onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      releaseOverlay(id)
    }
  }, [isOpen, id])
}
