export const BROWSER_IPC_CHANNELS = {
  getState: 'browser:getState',
  navigate: 'browser:navigate',
  goBack: 'browser:goBack',
  goForward: 'browser:goForward',
  reload: 'browser:reload',
  stop: 'browser:stop',
  openInDefaultBrowser: 'browser:openInDefaultBrowser',
  show: 'browser:show',
  hide: 'browser:hide',
  closeTab: 'browser:closeTab'
} as const

export const BROWSER_COMMAND_IDS = {
  focusAddress: 'browser.focusAddress',
  reload: 'browser.reload',
  back: 'browser.back',
  forward: 'browser.forward'
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
  canGoBack: boolean
  canGoForward: boolean
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

export type BrowserTabRequest = BrowserContextRequest & {
  tabId?: string
}

export type BrowserNavigateRequest = BrowserTabRequest & {
  input: string
}

export type BrowserPresentationRequest = BrowserTabRequest & {
  bounds: BrowserBounds
}

export type BrowserCloseTabRequest = BrowserContextRequest & {
  tabId: string
}

export type BrowserAPI = {
  getState: (request: BrowserContextRequest) => Promise<BrowserState>
  navigate: (request: BrowserNavigateRequest) => Promise<BrowserState>
  goBack: (request: BrowserTabRequest) => Promise<BrowserState>
  goForward: (request: BrowserTabRequest) => Promise<BrowserState>
  reload: (request: BrowserTabRequest) => Promise<BrowserState>
  stop: (request: BrowserTabRequest) => Promise<BrowserState>
  openInDefaultBrowser: (request: BrowserTabRequest) => Promise<void>
  show: (request: BrowserPresentationRequest) => Promise<BrowserState>
  hide: (request: BrowserContextRequest) => Promise<void>
  closeTab: (request: BrowserCloseTabRequest) => Promise<BrowserState>
}
