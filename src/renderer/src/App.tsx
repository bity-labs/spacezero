import { RouterProvider } from '@tanstack/react-router'

import { AppCommandProvider } from '../../features/app-commands/renderer/app-command-context'
import { CommandPaletteControllerProvider } from '../../features/command-palette/renderer/command-palette-controller'
import { AppCommandRegistration } from './app-command-registration'
import { ColorModeProvider } from './color-mode-provider'
import { router } from './router'
import './i18n'

export function App(): React.JSX.Element {
  return (
    <ColorModeProvider>
      <AppCommandProvider>
        <CommandPaletteControllerProvider>
          <AppCommandRegistration />
          <RouterProvider router={router} />
        </CommandPaletteControllerProvider>
      </AppCommandProvider>
    </ColorModeProvider>
  )
}
