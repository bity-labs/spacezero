export const BROWSER_IPC_CHANNELS = {
  getState: 'browser:getState',
  navigate: 'browser:navigate',
  goBack: 'browser:goBack',
  goForward: 'browser:goForward',
  reload: 'browser:reload',
  stop: 'browser:stop',
  openInDefaultBrowser: 'browser:openInDefaultBrowser',
  openUrlInDefaultBrowser: 'browser:openUrlInDefaultBrowser',
  openDownload: 'browser:openDownload',
  revealDownload: 'browser:revealDownload',
  show: 'browser:show',
  hide: 'browser:hide',
  createTab: 'browser:createTab',
  selectTab: 'browser:selectTab',
  closeTab: 'browser:closeTab',
  reorderTabs: 'browser:reorderTabs',
  clearData: 'browser:clearData',
  event: 'browser:event'
} as const

export const BROWSER_COMMAND_IDS = {
  focusAddress: 'browser.focusAddress',
  newTab: 'browser.newTab',
  closeActiveTab: 'browser.closeActiveTab',
  reload: 'browser.reload',
  back: 'browser.back',
  forward: 'browser.forward'
} as const

export type BrowserContext =
  | { kind: 'project-home'; projectId: string }
  | { kind: 'project-session'; projectId: string; sessionId: string }
  | { kind: 'workspace-session'; sessionId: string }
  | { kind: 'global-chat' }
  | { kind: 'knowledge-base' }

export function browserContextKey(context: BrowserContext): string {
  switch (context.kind) {
    case 'project-home':
      return `project:${context.projectId}`
    case 'project-session':
    case 'workspace-session':
      return `session:${context.sessionId}`
    case 'global-chat':
      return 'global-chat'
    case 'knowledge-base':
      return 'knowledge-base'
  }
}

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
  faviconUrl: string | null
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

export const BROWSER_CLEAR_DATA_CATEGORIES = [
  'cookies-and-site-storage',
  'cache',
  'temporary-grants'
] as const

export type BrowserClearDataCategory = (typeof BROWSER_CLEAR_DATA_CATEGORIES)[number]

export type BrowserClearDataFailure = {
  category: BrowserClearDataCategory
  message: string
}

export type BrowserClearDataResult = {
  status: 'cleared' | 'partial-failure' | 'failed'
  cleared: BrowserClearDataCategory[]
  failures: BrowserClearDataFailure[]
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

export type BrowserShortcutBinding = {
  commandId: (typeof BROWSER_COMMAND_IDS)[keyof typeof BROWSER_COMMAND_IDS]
  keybinding: { normalized: string }
}

export type BrowserPresentationRequest = BrowserTabRequest & {
  bounds: BrowserBounds
  shortcutBindings: BrowserShortcutBinding[]
}

export type BrowserCreateTabRequest = BrowserContextRequest & {
  input?: string
}

export type BrowserOpenUrlInDefaultBrowserRequest = {
  url: string
}

export type BrowserSelectTabRequest = BrowserContextRequest & {
  tabId: string
}

export type BrowserCloseTabRequest = BrowserContextRequest & {
  tabId: string
}

export type BrowserReorderTabsRequest = BrowserContextRequest & {
  tabIds: string[]
}

export type BrowserStateChangedEvent = {
  type: 'state-changed'
  contextKey: string
  state: BrowserState
}

export type BrowserCommandRequestedEvent = {
  type: 'command-requested'
  contextKey: string
  commandId: (typeof BROWSER_COMMAND_IDS)[keyof typeof BROWSER_COMMAND_IDS]
}

export type BrowserDownloadStatus =
  | 'selecting-save-location'
  | 'downloading'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type BrowserDownloadSnapshot = {
  id: string
  tabId: string
  filename: string
  status: BrowserDownloadStatus
  receivedBytes: number
  totalBytes: number | null
}

export type BrowserDownloadUpdatedEvent = {
  type: 'download-updated'
  download: BrowserDownloadSnapshot
}

export type BrowserDownloadActionRequest = {
  downloadId: string
}

export type BrowserEvent =
  | BrowserStateChangedEvent
  | BrowserCommandRequestedEvent
  | BrowserDownloadUpdatedEvent

export type BrowserAPI = {
  getState: (request: BrowserContextRequest) => Promise<BrowserState>
  navigate: (request: BrowserNavigateRequest) => Promise<BrowserState>
  goBack: (request: BrowserTabRequest) => Promise<BrowserState>
  goForward: (request: BrowserTabRequest) => Promise<BrowserState>
  reload: (request: BrowserTabRequest) => Promise<BrowserState>
  stop: (request: BrowserTabRequest) => Promise<BrowserState>
  openInDefaultBrowser: (request: BrowserTabRequest) => Promise<void>
  openUrlInDefaultBrowser: (request: BrowserOpenUrlInDefaultBrowserRequest) => Promise<void>
  openDownload: (request: BrowserDownloadActionRequest) => Promise<void>
  revealDownload: (request: BrowserDownloadActionRequest) => Promise<void>
  show: (request: BrowserPresentationRequest) => Promise<BrowserState>
  hide: (request: BrowserContextRequest) => Promise<void>
  createTab: (request: BrowserCreateTabRequest) => Promise<BrowserState>
  selectTab: (request: BrowserSelectTabRequest) => Promise<BrowserState>
  closeTab: (request: BrowserCloseTabRequest) => Promise<BrowserState>
  reorderTabs: (request: BrowserReorderTabsRequest) => Promise<BrowserState>
  clearData: () => Promise<BrowserClearDataResult>
  onEvent: (listener: (event: BrowserEvent) => void) => () => void
}
