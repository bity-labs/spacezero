import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandRegistry } from '../../app-commands/renderer/app-command-registry'
import type { AppCommandInvocationContext } from '../../app-commands/renderer/app-command.model'
import { KeyboardShortcutManager } from './keyboard-shortcut-manager'

function stubPlatform(platform: string): void {
  Object.defineProperty(window.navigator, 'platform', {
    value: platform,
    configurable: true
  })
}

function press(keys: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }): KeyboardEvent {
  return new KeyboardEvent('keydown', keys)
}

function invocationContext(): AppCommandInvocationContext {
  return { spacezero: window.spacezero }
}

describe('KeyboardShortcutManager', () => {
  let registry: AppCommandRegistry
  let manager: KeyboardShortcutManager
  let handler: ReturnType<typeof vi.fn<(context: AppCommandInvocationContext) => void>>

  beforeEach(() => {
    stubPlatform('MacIntel')
    registry = new AppCommandRegistry()
    manager = new KeyboardShortcutManager(registry, invocationContext())
    handler = vi.fn()
  })

  it('dispatches a command when the default keybinding matches', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    await manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not dispatch on a partial match', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+shift+p' } })

    await manager.handleKeyDown(press({ key: 'p', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores repeated keydown events', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    const event = press({ key: 'k', metaKey: true })
    Object.defineProperty(event, 'repeat', { value: true })
    await manager.handleKeyDown(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not dispatch when a text input is focused unless explicitly allowed', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    await manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('dispatches in a text input when allowInTextInput is true', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({
      commandId: 'test.run',
      defaultKeybinding: { normalized: 'mod+k' },
      allowInTextInput: true
    })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    await manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()

    document.body.removeChild(input)
  })

  it('uses a user override keybinding instead of the default', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })
    manager.setUserOverride('test.run', { normalized: 'alt+enter' })

    await manager.handleKeyDown(press({ key: 'Enter', altKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('removing a user override restores the default binding', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })
    manager.setUserOverride('test.run', { normalized: 'alt+enter' })
    manager.setUserOverride('test.run', null)

    await manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('respects a when predicate', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({
      commandId: 'test.run',
      defaultKeybinding: { normalized: 'mod+k' },
      when: (ctx) => !ctx.commandPaletteOpen
    })

    manager.setContext({ commandPaletteOpen: true })
    await manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()

    manager.setContext({ commandPaletteOpen: false })
    await manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('does nothing when the command is not registered in the registry', async () => {
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    await expect(manager.handleKeyDown(press({ key: 'k', metaKey: true }))).resolves.toBeUndefined()
  })

  it('unregisters a shortcut when the unsubscribe function is called', async () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    const unregister = manager.register({
      commandId: 'test.run',
      defaultKeybinding: { normalized: 'mod+k' }
    })

    unregister()
    await manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()
  })
})
