export const TERMINAL_IPC_CHANNELS = {
  listTabs: 'terminal:listTabs',
  create: 'terminal:create',
  selectTab: 'terminal:selectTab',
  reorderTabs: 'terminal:reorderTabs',
  subscribe: 'terminal:subscribe',
  unsubscribe: 'terminal:unsubscribe',
  writeInput: 'terminal:writeInput',
  resize: 'terminal:resize',
  close: 'terminal:close',
  event: 'terminal:event'
} as const

export const TERMINAL_COMMAND_IDS = {
  newTab: 'terminal.newTab',
  closeActiveTab: 'terminal.closeActiveTab'
} as const

export type TerminalContext =
  | { kind: 'project-session'; sessionId: string }
  | { kind: 'workspace-session'; sessionId: string }
  | { kind: 'global-chat' }
  | { kind: 'knowledge-base' }

export type TerminalId = string

export type TerminalTab = {
  terminalId: TerminalId
  title: string
}

export type TerminalTabsSnapshot = {
  tabs: TerminalTab[]
  activeTerminalId: TerminalId | null
}

export type TerminalDiagnostic = {
  type: 'cwd-fallback'
  terminalId: TerminalId
  savedCwd: string
  cwd: string
  message: string
}

export type TerminalListTabsRequest = {
  context: TerminalContext
}

export type TerminalCreateRequest = {
  context: TerminalContext
  cols?: number
  rows?: number
  forceNew?: boolean
}

export type TerminalCreateResult =
  | ({
      status: 'running'
      terminalId: TerminalId
      diagnostics?: TerminalDiagnostic[]
    } & Partial<TerminalTabsSnapshot>)
  | ({
      status: 'empty'
      terminalId: null
      diagnostics?: TerminalDiagnostic[]
    } & Partial<TerminalTabsSnapshot>)

export type TerminalSelectTabRequest = {
  context: TerminalContext
  terminalId: TerminalId
}

export type TerminalReorderTabsRequest = {
  context: TerminalContext
  terminalIds: TerminalId[]
}

export type TerminalSubscribeRequest = {
  terminalId: TerminalId
  context: TerminalContext
  afterSequence?: number
}

export type TerminalOutputEvent = {
  type: 'output'
  terminalId: TerminalId
  sequence: number
  data: string
}

export type TerminalExitEvent = {
  type: 'exit'
  terminalId: TerminalId
  exitCode: number | null
  signal?: number | string | null
}

export type TerminalTabUpdatedEvent = {
  type: 'tab-updated'
  terminalId: TerminalId
  title: string
}

export type TerminalEvent = TerminalOutputEvent | TerminalExitEvent | TerminalTabUpdatedEvent

export type TerminalSubscribeResult = {
  terminalId: TerminalId
  events: TerminalEvent[]
  oldestSequence: number
  nextSequence: number
}

export type TerminalUnsubscribeRequest = {
  terminalId: TerminalId
  context: TerminalContext
}

export type TerminalWriteInputRequest = {
  terminalId: TerminalId
  context: TerminalContext
  data: string
}

export type TerminalResizeRequest = {
  terminalId: TerminalId
  context: TerminalContext
  cols: number
  rows: number
}

export type TerminalCloseRequest = {
  terminalId: TerminalId
  context: TerminalContext
}

export type TerminalAPI = {
  listTabs: (request: TerminalListTabsRequest) => Promise<TerminalTabsSnapshot>
  create: (request: TerminalCreateRequest) => Promise<TerminalCreateResult>
  selectTab: (request: TerminalSelectTabRequest) => Promise<TerminalTabsSnapshot>
  reorderTabs: (request: TerminalReorderTabsRequest) => Promise<TerminalTabsSnapshot>
  subscribe: (request: TerminalSubscribeRequest) => Promise<TerminalSubscribeResult>
  unsubscribe: (request: TerminalUnsubscribeRequest) => Promise<void>
  writeInput: (request: TerminalWriteInputRequest) => Promise<void>
  resize: (request: TerminalResizeRequest) => Promise<void>
  close: (request: TerminalCloseRequest) => Promise<TerminalTabsSnapshot>
  onEvent: (listener: (event: TerminalEvent) => void) => () => void
}
