import { RouterProvider } from '@tanstack/react-router'

import { AppCommandProvider } from '../../features/app-commands/renderer/app-command-context'
import { CommandPaletteControllerProvider } from '../../features/command-palette/renderer/command-palette-controller'
import { GitHubQueryProvider } from '../../features/github/renderer'
import { KeyboardShortcutsProvider } from '../../features/keyboard-shortcuts/renderer/keyboard-shortcut-provider'
import { OnboardingGate } from '../../features/onboarding/renderer'
import { AppCommandRegistration } from './app-command-registration'
import { ColorModeProvider } from './color-mode-provider'
import { router } from './router'
import './i18n'

export function App(): React.JSX.Element {
  return (
    <GitHubQueryProvider>
      <ColorModeProvider>
        <OnboardingGate>
          <AppCommandProvider>
            <CommandPaletteControllerProvider>
              <KeyboardShortcutsProvider>
                <AppCommandRegistration />
                <RouterProvider router={router} />
              </KeyboardShortcutsProvider>
            </CommandPaletteControllerProvider>
          </AppCommandProvider>
        </OnboardingGate>
      </ColorModeProvider>
    </GitHubQueryProvider>
  )
}
