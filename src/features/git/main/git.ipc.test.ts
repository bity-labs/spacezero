import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GIT_IPC_CHANNELS } from '../shared'

const handlers = new Map<string, (event: { sender: TestSender }, request: unknown) => unknown>()
const observeProjectSession = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (event: { sender: TestSender }, request: unknown) => unknown) => {
        handlers.set(channel, handler)
      }
    )
  }
}))

vi.mock('./git.runtime', () => ({
  getGitService: () => ({ observe: observeProjectSession })
}))

type TestSender = EventEmitter & {
  destroyed: boolean
  isDestroyed: () => boolean
  send: ReturnType<typeof vi.fn>
}

function createSender(): TestSender {
  const sender = new EventEmitter() as TestSender
  sender.destroyed = false
  sender.isDestroyed = vi.fn(() => sender.destroyed)
  sender.send = vi.fn()
  return sender
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('Git IPC observation lifecycle', () => {
  beforeEach(async () => {
    handlers.clear()
    observeProjectSession.mockReset()
    const module = await import('./git.ipc')
    module.registerGitIpc()
  })

  it('closes exactly once when the sender is destroyed during deferred watcher startup', async () => {
    const sender = createSender()
    const close = vi.fn()
    const started = deferred<() => void>()
    observeProjectSession.mockReturnValue(started.promise)
    const handler = handlers.get(GIT_IPC_CHANNELS.observeProjectSession)
    if (!handler) throw new Error('observe handler was not registered')

    const response = handler({ sender }, { sessionId: 'session-1' }) as Promise<{
      subscriptionId: string
    }>
    expect(sender.listenerCount('destroyed')).toBe(1)
    sender.destroyed = true
    sender.emit('destroyed')
    started.resolve(close)

    await expect(response).resolves.toEqual({ subscriptionId: expect.any(String) })
    expect(close).toHaveBeenCalledTimes(1)
    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it('removes the sender destroyed listener when watcher startup rejects', async () => {
    const sender = createSender()
    const startupError = new Error('missing managed worktree')
    observeProjectSession.mockRejectedValue(startupError)
    const handler = handlers.get(GIT_IPC_CHANNELS.observeProjectSession)
    if (!handler) throw new Error('observe handler was not registered')

    await expect(handler({ sender }, { sessionId: 'session-1' })).rejects.toThrow(
      'missing managed worktree'
    )
    expect(sender.listenerCount('destroyed')).toBe(0)

    sender.destroyed = true
    sender.emit('destroyed')
    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it('emits Knowledge Base observation events with the stable context key and no session id', async () => {
    const sender = createSender()
    let notify!: (event: { kind: 'repository-changed' }) => void
    observeProjectSession.mockImplementation(async (_context, onEvent) => {
      notify = onEvent
      return vi.fn()
    })
    const observe = handlers.get(GIT_IPC_CHANNELS.observe)
    if (!observe) throw new Error('Git observe handler was not registered')

    const { subscriptionId } = (await observe(
      { sender },
      { context: { kind: 'knowledge-base', contextKey: 'knowledge-base' } }
    )) as { subscriptionId: string }
    notify({ kind: 'repository-changed' })

    expect(observeProjectSession).toHaveBeenCalledWith(
      { kind: 'knowledge-base', contextKey: 'knowledge-base' },
      expect.any(Function)
    )
    expect(sender.send).toHaveBeenCalledWith(GIT_IPC_CHANNELS.observationEvent, {
      subscriptionId,
      contextKey: 'knowledge-base',
      kind: 'repository-changed'
    })
  })

  it('removes sender destroyed listeners on repeated observe and unobserve churn', async () => {
    const sender = createSender()
    const closes = [vi.fn(), vi.fn(), vi.fn()]
    observeProjectSession
      .mockResolvedValueOnce(closes[0])
      .mockResolvedValueOnce(closes[1])
      .mockResolvedValueOnce(closes[2])
    const observe = handlers.get(GIT_IPC_CHANNELS.observeProjectSession)
    const unobserve = handlers.get(GIT_IPC_CHANNELS.unobserveProjectSession)
    if (!observe || !unobserve) throw new Error('Git observation handlers were not registered')

    for (let index = 0; index < closes.length; index += 1) {
      const { subscriptionId } = (await observe({ sender }, { sessionId: 'session-1' })) as {
        subscriptionId: string
      }
      expect(sender.listenerCount('destroyed')).toBe(1)
      await unobserve({ sender }, { subscriptionId })
      expect(closes[index]).toHaveBeenCalledTimes(1)
      expect(sender.listenerCount('destroyed')).toBe(0)
    }

    sender.destroyed = true
    sender.emit('destroyed')
    for (const close of closes) expect(close).toHaveBeenCalledTimes(1)
  })
})
