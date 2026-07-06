import { RouterProvider } from '@tanstack/react-router'

import { ColorModeProvider } from './color-mode-provider'
import { router } from './router'
import './i18n'

export function App(): React.JSX.Element {
  return (
    <ColorModeProvider>
      <RouterProvider router={router} />
    </ColorModeProvider>
  )
}
