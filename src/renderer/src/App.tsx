import { RouterProvider } from '@tanstack/react-router'

import { KeyboardShortcutsProvider } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import { ColorModeProvider } from './color-mode-provider'
import { router } from './router'
import './i18n'

export function App(): React.JSX.Element {
  return (
    <ColorModeProvider>
      <KeyboardShortcutsProvider>
        <RouterProvider router={router} />
      </KeyboardShortcutsProvider>
    </ColorModeProvider>
  )
}
