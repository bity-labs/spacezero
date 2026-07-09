import { useCallback, type KeyboardEvent, type PointerEvent } from 'react'

import {
  SIDEBAR_KEYBOARD_RESIZE_STEP,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth
} from '../components/sidebar/sidebar-layout'

type SidebarResizeSide = 'left' | 'right'

type SidebarResizeOptions = {
  side?: SidebarResizeSide
  width: number
  setWidth: (width: number) => void
}

type SidebarResizeHandlers = {
  resizeSidebar: (width: number) => void
  startResize: (event: PointerEvent<HTMLDivElement>) => void
  resizeWithKeyboard: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function useSidebarResize({
  side = 'left',
  width,
  setWidth
}: SidebarResizeOptions): SidebarResizeHandlers {
  const resizeSidebar = useCallback(
    (nextWidth: number) => {
      setWidth(clampSidebarWidth(nextWidth))
    },
    [setWidth]
  )

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()

      const startX = event.clientX
      const startWidth = width

      function handlePointerMove(moveEvent: globalThis.PointerEvent): void {
        const pointerDelta = moveEvent.clientX - startX
        const nextWidth = side === 'left' ? startWidth + pointerDelta : startWidth - pointerDelta
        resizeSidebar(nextWidth)
      }

      function handlePointerUp(): void {
        window.removeEventListener('pointermove', handlePointerMove)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp, { once: true })
    },
    [resizeSidebar, side, width]
  )

  const resizeWithKeyboard = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let nextWidth = width

      if (event.key === 'Home') nextWidth = SIDEBAR_MIN_WIDTH
      if (event.key === 'End') nextWidth = SIDEBAR_MAX_WIDTH
      if (event.key === 'ArrowLeft')
        nextWidth =
          width + (side === 'right' ? SIDEBAR_KEYBOARD_RESIZE_STEP : -SIDEBAR_KEYBOARD_RESIZE_STEP)
      if (event.key === 'ArrowRight')
        nextWidth =
          width + (side === 'left' ? SIDEBAR_KEYBOARD_RESIZE_STEP : -SIDEBAR_KEYBOARD_RESIZE_STEP)

      if (nextWidth !== width) {
        event.preventDefault()
        resizeSidebar(nextWidth)
      }
    },
    [resizeSidebar, side, width]
  )

  return { resizeSidebar, startResize, resizeWithKeyboard }
}
