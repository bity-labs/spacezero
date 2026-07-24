export const TERMINAL_IPC_CHANNELS = {
  create: 'terminal:create',
  subscribe: 'terminal:subscribe',
  unsubscribe: 'terminal:unsubscribe',
  writeInput: 'terminal:writeInput',
  resize: 'terminal:resize',
  close: 'terminal:close',
  event: 'terminal:event'
} as const

export type TerminalContext =
  | { kind: 'project-session'; sessionId: string }
  | { kind: 'workspace-session'; sessionId: string }
  | { kind: 'knowledge-base' }

export type TerminalId = string

export type TerminalCreateRequest = {
  context: TerminalContext
  cols?: number
  rows?: number
  forceNew?: boolean
}

export type TerminalCreateResult =
  | {
      status: 'running'
      terminalId: TerminalId
    }
  | {
      status: 'empty'
      terminalId: null
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

export type TerminalEvent = TerminalOutputEvent | TerminalExitEvent

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
  create: (request: TerminalCreateRequest) => Promise<TerminalCreateResult>
  subscribe: (request: TerminalSubscribeRequest) => Promise<TerminalSubscribeResult>
  unsubscribe: (request: TerminalUnsubscribeRequest) => Promise<void>
  writeInput: (request: TerminalWriteInputRequest) => Promise<void>
  resize: (request: TerminalResizeRequest) => Promise<void>
  close: (request: TerminalCloseRequest) => Promise<void>
  onEvent: (listener: (event: TerminalEvent) => void) => () => void
}
