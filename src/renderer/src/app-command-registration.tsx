import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useRegisterAppCommands } from '../../features/app-commands/renderer/app-command-context'
import type { AppCommand } from '../../features/app-commands/renderer/app-command.model'
import { router } from './router'

export function AppCommandRegistration(): null {
  const { t } = useTranslation()

  const commands = useMemo<readonly AppCommand[]>(
    () => [
      {
        id: 'navigation.open-workspace',
        title: t('appCommands.openWorkspace'),
        category: t('appCommands.categories.navigation'),
        keywords: ['home', 'main'],
        handler: () => void router.navigate({ to: '/' })
      },
      {
        id: 'navigation.open-settings',
        title: t('appCommands.openSettings'),
        category: t('appCommands.categories.navigation'),
        keywords: ['preferences', 'options', 'configuration'],
        handler: () => void router.navigate({ to: router.state.location.pathname === '/settings' ? '/' : '/settings' })
      }
    ],
    [t]
  )

  useRegisterAppCommands(commands)

  return null
}
