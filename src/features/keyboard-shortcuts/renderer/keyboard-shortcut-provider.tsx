import { useEffect } from 'react'

import { isTextInputElement } from './keybinding-parser'
import { keyboardShortcutManager } from './keyboard-shortcut-manager'

/**
 * Attaches the global keyboard shortcut manager to the renderer window.
 *
 * Place this once near the root of the React tree, inside any providers that
 * commands may depend on (for example, color mode or router providers).
 */
export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
    const manager = keyboardShortcutManager

    function handleFocusIn(): void {
      manager.setContext({ textInputFocused: isTextInputElement(document.activeElement) })
    }

    function handleKeyDown(event: KeyboardEvent): void {
      manager.handleKeyDown(event)
    }

    // Initialize context from the currently focused element on mount.
    handleFocusIn()

    document.addEventListener('focusin', handleFocusIn)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return <>{children}</>
}
