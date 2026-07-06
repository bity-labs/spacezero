import {
  AppCommandId,
  AppCommandRegistry,
  appCommandRegistry
} from '../../app-commands/renderer/app-command-registry'
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
  private readonly shortcuts = new Map<AppCommandId, KeyboardShortcutDefinition>()
  private context: ShortcutContext
  private readonly userOverrides = new Map<AppCommandId, Keybinding>()

  constructor(registry: AppCommandRegistry, initialContext?: ShortcutContext) {
    this.registry = registry
    this.context = initialContext ?? createDefaultShortcutContext()
  }

  /** Register a shortcut. Returns an unsubscribe function. */
  register(definition: KeyboardShortcutDefinition): () => void {
    this.shortcuts.set(definition.commandId, definition)
    return () => {
      this.shortcuts.delete(definition.commandId)
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
  }

  setContext(partial: Partial<ShortcutContext>): void {
    this.context = { ...this.context, ...partial }
  }

  getContext(): ShortcutContext {
    return this.context
  }

  handleKeyDown(event: KeyboardEvent): void {
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
      this.registry.execute(definition.commandId)
      return
    }
  }

  private resolveBinding(definition: KeyboardShortcutDefinition): Keybinding {
    return this.userOverrides.get(definition.commandId) ?? definition.userOverride ?? definition.defaultKeybinding
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

/** Global renderer shortcut manager wired to the global App Command Registry. */
export const keyboardShortcutManager = new KeyboardShortcutManager(appCommandRegistry)
