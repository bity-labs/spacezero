import { AppCommandRegistry } from '../../app-commands/renderer/app-command-registry'
import { type AppCommandId, AppCommandInvocationContext } from '../../app-commands/renderer/app-command.model'
import { Keybinding, ShortcutContext, createDefaultShortcutContext } from './keybinding.model'
import { isTextInputElement, matchKeyboardEvent } from './keybinding-parser'

export interface KeyboardShortcutDefinition {
  /** App Command ID dispatched when the shortcut matches. */
  commandId: AppCommandId
  /** Default keybinding shipped with the app. */
  defaultKeybinding: Keybinding
  /** Optional per-shortcut override (used for built-in remapping layers). */
  userOverride?: Keybinding
  /** Optional context predicate. Receives the current shortcut context. */
  when?: (ctx: ShortcutContext) => boolean
  /** Whether the shortcut should fire while a text input is focused. */
  allowInTextInput?: boolean
}

/**
 * Renderer-local keyboard shortcut manager.
 *
 * Listens to keyboard events, resolves normalized keybindings, applies context
 * gating, and dispatches stable App Command IDs through the App Command Registry.
 */
export class KeyboardShortcutManager {
  private readonly registry: AppCommandRegistry
  private readonly invocationContext: AppCommandInvocationContext
  private readonly shortcuts = new Map<AppCommandId, KeyboardShortcutDefinition>()
  private context: ShortcutContext
  private readonly userOverrides = new Map<AppCommandId, Keybinding>()
  private readonly bindingListeners = new Set<() => void>()

  constructor(
    registry: AppCommandRegistry,
    invocationContext: AppCommandInvocationContext,
    initialContext?: ShortcutContext
  ) {
    this.registry = registry
    this.invocationContext = invocationContext
    this.context = initialContext ?? createDefaultShortcutContext()
  }

  /** Register a shortcut. Returns an unsubscribe function. */
  register(definition: KeyboardShortcutDefinition): () => void {
    this.shortcuts.set(definition.commandId, definition)
    this.emitBindingsChanged()
    return () => {
      this.shortcuts.delete(definition.commandId)
      this.emitBindingsChanged()
    }
  }

  /**
   * Set or clear a user override for a command.
   * Passing `null` removes the override and restores the default binding.
   */
  setUserOverride(commandId: AppCommandId, binding: Keybinding | null): void {
    if (binding) {
      this.userOverrides.set(commandId, binding)
    } else {
      this.userOverrides.delete(commandId)
    }
    this.emitBindingsChanged()
  }

  onBindingsChanged(listener: () => void): () => void {
    this.bindingListeners.add(listener)
    return () => {
      this.bindingListeners.delete(listener)
    }
  }

  getEffectiveKeybinding(commandId: AppCommandId): Keybinding | null {
    const definition = this.shortcuts.get(commandId)
    if (!definition) return null
    return this.resolveBinding(definition)
  }

  resolveKeybinding(definition: KeyboardShortcutDefinition): Keybinding {
    return this.resolveBinding(definition)
  }

  setContext(partial: Partial<ShortcutContext>): void {
    this.context = { ...this.context, ...partial }
  }

  getContext(): ShortcutContext {
    return this.context
  }

  async handleKeyDown(event: KeyboardEvent): Promise<void> {
    if (event.repeat) {
      return
    }

    const activeElement = typeof document !== 'undefined' ? document.activeElement : null
    const context: ShortcutContext = {
      ...this.context,
      textInputFocused: isTextInputElement(activeElement)
    }

    for (const definition of this.shortcuts.values()) {
      const binding = this.resolveBinding(definition)

      if (!matchKeyboardEvent(event, binding)) {
        continue
      }

      if (!this.evaluateWhen(definition, context)) {
        continue
      }

      event.preventDefault()

      try {
        await this.registry.invoke(definition.commandId, this.invocationContext)
      } catch (error) {
        // The command may have been unregistered between registration and the keystroke.
        console.error(`Failed to invoke shortcut command ${definition.commandId}:`, error)
      }

      return
    }
  }

  private resolveBinding(definition: KeyboardShortcutDefinition): Keybinding {
    return this.userOverrides.get(definition.commandId) ?? definition.userOverride ?? definition.defaultKeybinding
  }

  private emitBindingsChanged(): void {
    for (const listener of this.bindingListeners) listener()
  }

  private evaluateWhen(definition: KeyboardShortcutDefinition, context: ShortcutContext): boolean {
    if (context.textInputFocused && !definition.allowInTextInput) {
      return false
    }

    if (definition.when) {
      return definition.when(context)
    }

    return true
  }
}
