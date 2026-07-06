import { describe, expect, it, vi } from 'vitest'

import { AppCommandRegistry } from './app-command-registry'

describe('AppCommandRegistry', () => {
  it('registers and executes a command', () => {
    const registry = new AppCommandRegistry()
    const handler = vi.fn<() => void>()

    registry.register({
      id: 'test.doThing',
      title: 'Do thing',
      category: 'Test',
      handler
    })

    const executed = registry.execute('test.doThing')

    expect(executed).toBe(true)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('returns false when executing an unknown command', () => {
    const registry = new AppCommandRegistry()

    const executed = registry.execute('test.unknown')

    expect(executed).toBe(false)
  })

  it('unregisters a command when the unsubscribe function is called', () => {
    const registry = new AppCommandRegistry()
    const handler = vi.fn<() => void>()

    const unregister = registry.register({
      id: 'test.doThing',
      title: 'Do thing',
      category: 'Test',
      handler
    })

    unregister()
    const executed = registry.execute('test.doThing')

    expect(executed).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('overwrites a command registered with the same ID', () => {
    const registry = new AppCommandRegistry()
    const firstHandler = vi.fn<() => void>()
    const secondHandler = vi.fn<() => void>()

    registry.register({
      id: 'test.doThing',
      title: 'Do thing',
      category: 'Test',
      handler: firstHandler
    })

    registry.register({
      id: 'test.doThing',
      title: 'Do thing',
      category: 'Test',
      handler: secondHandler
    })

    registry.execute('test.doThing')

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledOnce()
  })

  it('lists all registered commands', () => {
    const registry = new AppCommandRegistry()

    registry.register({
      id: 'test.a',
      title: 'A',
      category: 'Test',
      handler: () => {}
    })
    registry.register({
      id: 'test.b',
      title: 'B',
      category: 'Test',
      handler: () => {}
    })

    const all = registry.getAll()

    expect(all).toHaveLength(2)
    expect(all.map((cmd) => cmd.id)).toContain('test.a')
    expect(all.map((cmd) => cmd.id)).toContain('test.b')
  })
})
