import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), once: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ id: 7 }))
  },
  ipcMain: { handle: vi.fn() }
}))

import { createTerminalHandlers } from './terminal.ipc'

const context = { kind: 'project-session' as const, sessionId: 'session-1' }
const event = { sender: {} } as never

describe('Terminal IPC boundary', () => {
  it('validates create, input, resize, subscription, and close requests before calling main services', async () => {
    const service = {
      create: vi.fn(async () => ({ status: 'running' as const, terminalId: 'terminal-1' })),
      subscribe: vi.fn(async () => ({
        terminalId: 'terminal-1',
        events: [],
        oldestSequence: 1,
        nextSequence: 1
      })),
      unsubscribe: vi.fn(async () => undefined),
      writeInput: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    }
    const handlers = createTerminalHandlers(service)

    await expect(handlers.create(event, { context, cols: 80, rows: 24 })).resolves.toEqual({
      status: 'running',
      terminalId: 'terminal-1'
    })
    await expect(
      handlers.writeInput(event, { terminalId: 'terminal-1', context, data: 'echo ok\r' })
    ).resolves.toBeUndefined()
    await expect(
      handlers.resize(event, { terminalId: 'terminal-1', context, cols: 120, rows: 40 })
    ).resolves.toBeUndefined()
    await expect(
      handlers.subscribe(event, { terminalId: 'terminal-1', context, afterSequence: 0 })
    ).resolves.toMatchObject({ terminalId: 'terminal-1' })
    await expect(
      handlers.unsubscribe(event, { terminalId: 'terminal-1', context })
    ).resolves.toBeUndefined()
    await expect(
      handlers.close(event, { terminalId: 'terminal-1', context })
    ).resolves.toBeUndefined()

    expect(service.create).toHaveBeenCalledWith({
      ownerWindowId: 7,
      request: { context, cols: 80, rows: 24, forceNew: false }
    })
    expect(service.writeInput).toHaveBeenCalledWith({
      ownerWindowId: 7,
      request: { terminalId: 'terminal-1', context, data: 'echo ok\r' }
    })
    expect(service.resize).toHaveBeenCalledWith({
      ownerWindowId: 7,
      request: { terminalId: 'terminal-1', context, cols: 120, rows: 40 }
    })

    expect(() =>
      handlers.create(event, {
        context: { kind: 'project-session', sessionId: '' },
        executable: '/bin/zsh'
      })
    ).toThrow()
    expect(() =>
      handlers.resize(event, { terminalId: 'terminal-1', context, cols: 0, rows: 9999 })
    ).toThrow()
    expect(() =>
      handlers.writeInput(event, { terminalId: 'terminal-1', context, data: '' })
    ).toThrow()
    expect(service.create).toHaveBeenCalledTimes(1)
    expect(service.writeInput).toHaveBeenCalledTimes(1)
    expect(service.resize).toHaveBeenCalledTimes(1)
  })
})
