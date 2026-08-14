import { useNavigate, useRouterState } from '@tanstack/react-router'

import { useGitHubConnection } from '../../../../features/github/renderer'
import { UpdateRestartControl } from '../../../../features/updates/renderer'
import { AccountMenuView } from './account-menu-view'

export type AccountMenuProps = {
  username?: string
  avatarUrl?: string
  avatarFallback?: string
  settingsLabel?: string
  settingsTo?: '/' | '/settings'
}

export function AccountMenu({
  username,
  avatarUrl,
  avatarFallback,
  settingsLabel,
  settingsTo
}: AccountMenuProps): React.JSX.Element {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { connection } = useGitHubConnection()
  const connectedIdentity = connection?.status === 'connected' ? connection.identity : null
  const resolvedUsername =
    username ?? (connectedIdentity ? `@${connectedIdentity.login}` : 'Connect GitHub')
  const resolvedAvatarUrl = avatarUrl ?? connectedIdentity?.avatarUrl
  const resolvedAvatarFallback =
    avatarFallback ?? connectedIdentity?.login.slice(0, 1).toUpperCase() ?? 'GH'
  const resolvedSettingsTo = settingsTo ?? (pathname === '/settings' ? '/' : '/settings')
  const resolvedSettingsLabel =
    settingsLabel ?? (resolvedSettingsTo === '/settings' ? 'Settings' : 'Close settings')

  function handleOpenSettings(): void {
    if (resolvedSettingsTo === '/settings') {
      void navigate({ to: '/settings', search: { section: 'account' } })
      return
    }
    void navigate({ to: '/' })
  }

  return (
    <AccountMenuView
      username={resolvedUsername}
      avatarUrl={resolvedAvatarUrl}
      avatarFallback={resolvedAvatarFallback}
      settingsLabel={resolvedSettingsLabel}
      settingsHref={resolvedSettingsTo === '/settings' ? '#/settings?section=account' : '#/'}
      updateControl={<UpdateRestartControl placement="sidebar" />}
      onOpenSettings={handleOpenSettings}
    />
  )
}
