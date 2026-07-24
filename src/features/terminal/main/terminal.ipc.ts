import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'

import {
  TERMINAL_IPC_CHANNELS,
  terminalCloseRequestSchema,
  terminalCreateRequestSchema,
  terminalResizeRequestSchema,
  terminalSubscribeRequestSchema,
  terminalUnsubscribeRequestSchema,
  terminalWriteInputRequestSchema,
  type TerminalAPI,
  type TerminalCloseRequest,
  type TerminalCreateRequest,
  type TerminalResizeRequest,
  type TerminalSubscribeRequest,
  type TerminalUnsubscribeRequest,
  type TerminalWriteInputRequest
} from '../shared'
import { getTerminalService } from './terminal.runtime'

type TerminalService = {
  create: (input: {
    ownerWindowId: number
    request: TerminalCreateRequest
  }) => ReturnType<TerminalAPI['create']>
  subscribe: (input: {
    ownerWindowId: number
    request: TerminalSubscribeRequest
  }) => ReturnType<TerminalAPI['subscribe']>
  unsubscribe: (input: {
    ownerWindowId: number
    request: TerminalUnsubscribeRequest
  }) => ReturnType<TerminalAPI['unsubscribe']>
  writeInput: (input: {
    ownerWindowId: number
    request: TerminalWriteInputRequest
  }) => ReturnType<TerminalAPI['writeInput']>
  resize: (input: {
    ownerWindowId: number
    request: TerminalResizeRequest
  }) => ReturnType<TerminalAPI['resize']>
  close: (input: {
    ownerWindowId: number
    request: TerminalCloseRequest
  }) => ReturnType<TerminalAPI['close']>
  closeAllForWindow?: (windowId: number) => Promise<void>
  closeAll?: () => Promise<void>
}

type TerminalIpcEvent = Pick<IpcMainInvokeEvent, 'sender'>

export function createTerminalHandlers(service: TerminalService): {
  create: (event: TerminalIpcEvent, input: unknown) => ReturnType<TerminalAPI['create']>
  subscribe: (event: TerminalIpcEvent, input: unknown) => ReturnType<TerminalAPI['subscribe']>
  unsubscribe: (event: TerminalIpcEvent, input: unknown) => ReturnType<TerminalAPI['unsubscribe']>
  writeInput: (event: TerminalIpcEvent, input: unknown) => ReturnType<TerminalAPI['writeInput']>
  resize: (event: TerminalIpcEvent, input: unknown) => ReturnType<TerminalAPI['resize']>
  close: (event: TerminalIpcEvent, input: unknown) => ReturnType<TerminalAPI['close']>
} {
  return {
    create: (event, input) =>
      service.create({
        ownerWindowId: getOwnerWindowId(event),
        request: terminalCreateRequestSchema.parse(input)
      }),
    subscribe: (event, input) =>
      service.subscribe({
        ownerWindowId: getOwnerWindowId(event),
        request: terminalSubscribeRequestSchema.parse(input)
      }),
    unsubscribe: (event, input) =>
      service.unsubscribe({
        ownerWindowId: getOwnerWindowId(event),
        request: terminalUnsubscribeRequestSchema.parse(input)
      }),
    writeInput: (event, input) =>
      service.writeInput({
        ownerWindowId: getOwnerWindowId(event),
        request: terminalWriteInputRequestSchema.parse(input)
      }),
    resize: (event, input) =>
      service.resize({
        ownerWindowId: getOwnerWindowId(event),
        request: terminalResizeRequestSchema.parse(input)
      }),
    close: (event, input) =>
      service.close({
        ownerWindowId: getOwnerWindowId(event),
        request: terminalCloseRequestSchema.parse(input)
      })
  }
}

export function registerTerminalIpc(): void {
  const service = getTerminalService()
  const handlers = createTerminalHandlers(service)
  ipcMain.handle(TERMINAL_IPC_CHANNELS.create, handlers.create)
  ipcMain.handle(TERMINAL_IPC_CHANNELS.subscribe, handlers.subscribe)
  ipcMain.handle(TERMINAL_IPC_CHANNELS.unsubscribe, handlers.unsubscribe)
  ipcMain.handle(TERMINAL_IPC_CHANNELS.writeInput, handlers.writeInput)
  ipcMain.handle(TERMINAL_IPC_CHANNELS.resize, handlers.resize)
  ipcMain.handle(TERMINAL_IPC_CHANNELS.close, handlers.close)

  app.on('browser-window-created', (_event, window) => {
    window.on('closed', () => {
      void service.closeAllForWindow?.(window.id)
    })
  })
  app.once('before-quit', () => {
    void service.closeAll?.()
  })
}

function getOwnerWindowId(event: TerminalIpcEvent): number {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) throw new Error('terminal.windowNotFound')
  return window.id
}
