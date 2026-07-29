import { useLayoutEffect, useState } from 'react'

const globalOverlaySelector = '[data-spacezero-global-overlay]'

/**
 * Reports whether a renderer-owned overlay is currently portaled above the app shell.
 * Native WebContentsView surfaces cannot participate in DOM stacking, so callers use
 * this signal to detach native content while an overlay is present.
 */
export function useGlobalOverlayOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false)

  useLayoutEffect(() => {
    const update = (): void => {
      setIsOpen(document.querySelector(globalOverlaySelector) !== null)
    }
    const observer = new MutationObserver(update)

    observer.observe(document.body, { childList: true, subtree: true })
    update()

    return () => observer.disconnect()
  }, [])

  return isOpen
}
