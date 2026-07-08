import { useCallback, useState } from 'react'

import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from './sidebar-layout'

const APP_SIDEBAR_WIDTH_STORAGE_KEY = 'spacezero.appSidebarWidth'

function readStoredSidebarWidth(): number {
  const storedWidth = window.localStorage.getItem(APP_SIDEBAR_WIDTH_STORAGE_KEY)
  if (!storedWidth) return SIDEBAR_DEFAULT_WIDTH

  const parsedWidth = Number.parseInt(storedWidth, 10)
  if (Number.isNaN(parsedWidth)) return SIDEBAR_DEFAULT_WIDTH

  return clampSidebarWidth(parsedWidth)
}

function useSidebarWidth(): readonly [number, (width: number) => void] {
  const [sidebarWidth, setSidebarWidthState] = useState(readStoredSidebarWidth)

  const setSidebarWidth = useCallback((width: number) => {
    const nextWidth = clampSidebarWidth(width)
    window.localStorage.setItem(APP_SIDEBAR_WIDTH_STORAGE_KEY, String(nextWidth))
    setSidebarWidthState(nextWidth)
  }, [])

  return [sidebarWidth, setSidebarWidth] as const
}

export { useSidebarWidth }
