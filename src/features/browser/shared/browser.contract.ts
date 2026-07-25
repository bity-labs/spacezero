export const BROWSER_IPC_CHANNELS = {
  getState: 'browser:getState',
  navigate: 'browser:navigate',
  show: 'browser:show',
  hide: 'browser:hide',
  closeTab: 'browser:closeTab'
} as const

export type BrowserContext =
  | { kind: 'project-session'; projectId: string; sessionId: string }
  | { kind: 'workspace-session'; sessionId: string }
  | { kind: 'knowledge-base' }

export type BrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type BrowserTab = {
  id: string
  url: string | null
  title: string | null
  isLoading: boolean
  error: string | null
}

export type BrowserState = {
  contextKey: string
  activeTabId: string
  tabs: BrowserTab[]
}

export type BrowserContextRequest = {
  contextKey: string
  context: BrowserContext
}

export type BrowserNavigateRequest = BrowserContextRequest & {
  tabId?: string
  input: string
}

export type BrowserPresentationRequest = BrowserContextRequest & {
  tabId?: string
  bounds: BrowserBounds
}

export type BrowserCloseTabRequest = BrowserContextRequest & {
  tabId: string
}

export type BrowserAPI = {
  getState: (request: BrowserContextRequest) => Promise<BrowserState>
  navigate: (request: BrowserNavigateRequest) => Promise<BrowserState>
  show: (request: BrowserPresentationRequest) => Promise<BrowserState>
  hide: (request: BrowserContextRequest) => Promise<void>
  closeTab: (request: BrowserCloseTabRequest) => Promise<BrowserState>
}
