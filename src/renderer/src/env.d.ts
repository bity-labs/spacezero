/// <reference types="vite/client" />

import type { SpaceZeroAPI } from '../../shared/ipc'

declare global {
  interface Window {
    spacezero: SpaceZeroAPI
    setTestPrefersDark?: (matches: boolean) => void
  }
}

export {}
