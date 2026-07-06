import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from 'react'

import {
  useAppCommandInvocationContext,
  useAppCommandRegistry
} from '../../app-commands/renderer/app-command-context'
import { isTextInputElement } from './keybinding-parser'
import {
  KeyboardShortcutDefinition,
  KeyboardShortcutManager
} from './keyboard-shortcut-manager'

type KeyboardShortcutsContextValue = {
  manager: KeyboardShortcutManager
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null)

/**
 * Attaches the global keyboard shortcut manager to the renderer window.
 *
 * Place this inside `AppCommandProvider` so the manager can dispatch commands
 * through the same registry used by the Command Palette.
 */
export function KeyboardShortcutsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const registry = useAppCommandRegistry()
  const invocationContext = useAppCommandInvocationContext()

  const manager = useMemo(
    () => new KeyboardShortcutManager(registry, invocationContext),
    [registry, invocationContext]
  )

  useEffect(() => {
    function handleFocusIn(): void {
      manager.setContext({ textInputFocused: isTextInputElement(document.activeElement) })
    }

    function handleKeyDown(event: KeyboardEvent): void {
      void manager.handleKeyDown(event)
    }

    // Initialize context from the currently focused element on mount.
    handleFocusIn()

    document.addEventListener('focusin', handleFocusIn)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [manager])

  return (
    <KeyboardShortcutsContext.Provider value={{ manager }}>{children}</KeyboardShortcutsContext.Provider>
  )
}

export function useKeyboardShortcutsManager(): KeyboardShortcutManager {
  const context = useContext(KeyboardShortcutsContext)
  if (!context) {
    throw new Error('Keyboard shortcut hooks must be used inside KeyboardShortcutsProvider')
  }

  return context.manager
}

/**
 * Register a static set of keyboard shortcuts with the global manager.
 * Definitions should be stable across renders (e.g. defined outside the component).
 */
export function useRegisterKeyboardShortcuts(
  definitions: readonly KeyboardShortcutDefinition[]
): void {
  const manager = useKeyboardShortcutsManager()

  useEffect(() => {
    const unregisterShortcuts = definitions.map((definition) => manager.register(definition))

    return () => {
      for (const unregisterShortcut of unregisterShortcuts.reverse()) {
        unregisterShortcut()
      }
    }
  }, [manager, definitions])
}
