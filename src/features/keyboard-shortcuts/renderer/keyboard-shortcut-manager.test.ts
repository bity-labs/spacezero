import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppCommandRegistry } from '../../app-commands/renderer/app-command-registry'
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

describe('KeyboardShortcutManager', () => {
  let registry: AppCommandRegistry
  let manager: KeyboardShortcutManager
  let handler: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    stubPlatform('MacIntel')
    registry = new AppCommandRegistry()
    manager = new KeyboardShortcutManager(registry)
    handler = vi.fn()
  })

  it('dispatches a command when the default keybinding matches', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not dispatch on a partial match', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+shift+p' } })

    manager.handleKeyDown(press({ key: 'p', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores repeated keydown events', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    const event = press({ key: 'k', metaKey: true })
    Object.defineProperty(event, 'repeat', { value: true })
    manager.handleKeyDown(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not dispatch when a text input is focused unless explicitly allowed', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('dispatches in a text input when allowInTextInput is true', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({
      commandId: 'test.run',
      defaultKeybinding: { normalized: 'mod+k' },
      allowInTextInput: true
    })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()

    document.body.removeChild(input)
  })

  it('uses a user override keybinding instead of the default', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })
    manager.setUserOverride('test.run', { normalized: 'alt+enter' })

    manager.handleKeyDown(press({ key: 'Enter', altKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('removing a user override restores the default binding', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })
    manager.setUserOverride('test.run', { normalized: 'alt+enter' })
    manager.setUserOverride('test.run', null)

    manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('respects a when predicate', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    manager.register({
      commandId: 'test.run',
      defaultKeybinding: { normalized: 'mod+k' },
      when: (ctx) => !ctx.commandPaletteOpen
    })

    manager.setContext({ commandPaletteOpen: true })
    manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()

    manager.setContext({ commandPaletteOpen: false })
    manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).toHaveBeenCalledOnce()
  })

  it('does nothing when the command is not registered in the registry', () => {
    manager.register({ commandId: 'test.run', defaultKeybinding: { normalized: 'mod+k' } })

    expect(() => manager.handleKeyDown(press({ key: 'k', metaKey: true }))).not.toThrow()
  })

  it('unregisters a shortcut when the unsubscribe function is called', () => {
    registry.register({ id: 'test.run', title: 'Run', category: 'Test', handler })
    const unregister = manager.register({
      commandId: 'test.run',
      defaultKeybinding: { normalized: 'mod+k' }
    })

    unregister()
    manager.handleKeyDown(press({ key: 'k', metaKey: true }))

    expect(handler).not.toHaveBeenCalled()
  })
})
