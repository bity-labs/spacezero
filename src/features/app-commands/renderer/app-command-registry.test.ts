import { AppCommandRegistry } from './app-command-registry'
import type { AppCommand, AppCommandInvocationContext } from './app-command.model'

function command(overrides: Partial<AppCommand> & Pick<AppCommand, 'id' | 'title'>): AppCommand {
  return {
    category: 'General',
    handler: () => undefined,
    ...overrides
  }
}

function invocationContext(): AppCommandInvocationContext {
  return { spacezero: window.spacezero }
}

describe('AppCommandRegistry', () => {
  it('registers and lists commands in registration order', () => {
    const registry = new AppCommandRegistry()

    registry.register(command({ id: 'workspace.open', title: 'Open Workspace' }))
    registry.register(command({ id: 'settings.open', title: 'Open Settings' }))

    expect(registry.list()).toEqual([
      expect.objectContaining({ id: 'workspace.open', title: 'Open Workspace' }),
      expect.objectContaining({ id: 'settings.open', title: 'Open Settings' })
    ])
  })

  it('rejects duplicate command IDs while the original command is registered', () => {
    const registry = new AppCommandRegistry()

    registry.register(command({ id: 'settings.open', title: 'Open Settings' }))

    expect(() =>
      registry.register(command({ id: 'settings.open', title: 'Open Preferences' }))
    ).toThrow('App command already registered: settings.open')
  })

  it('unregisters commands through the returned disposable', () => {
    const registry = new AppCommandRegistry()
    const unregister = registry.register(command({ id: 'settings.open', title: 'Open Settings' }))

    unregister()

    expect(registry.list()).toEqual([])
  })

  it('searches command titles, categories, and keywords case-insensitively', () => {
    const registry = new AppCommandRegistry()
    registry.register(
      command({ id: 'workspace.open', title: 'Open Workspace', category: 'Navigation' })
    )
    registry.register(
      command({
        id: 'settings.open',
        title: 'Open Settings',
        category: 'Navigation',
        keywords: ['preferences', 'options']
      })
    )
    registry.register(
      command({
        id: 'workspace.toggle-left-panel',
        title: 'Toggle Left Panel',
        category: 'Workspace UI'
      })
    )

    expect(registry.search('PREF')).toEqual([expect.objectContaining({ id: 'settings.open' })])
    expect(registry.search('workspace')).toEqual([
      expect.objectContaining({ id: 'workspace.open' }),
      expect.objectContaining({ id: 'workspace.toggle-left-panel' })
    ])
    expect(registry.search('navigation')).toEqual([
      expect.objectContaining({ id: 'workspace.open' }),
      expect.objectContaining({ id: 'settings.open' })
    ])
  })

  it('invokes a command by stable ID with an explicit invocation context', async () => {
    const registry = new AppCommandRegistry()
    const receivedContexts: AppCommandInvocationContext[] = []
    const context = invocationContext()
    registry.register(
      command({
        id: 'settings.open',
        title: 'Open Settings',
        handler: (receivedContext) => {
          receivedContexts.push(receivedContext)
        }
      })
    )

    await registry.invoke('settings.open', context)

    expect(receivedContexts).toEqual([context])
  })
})
