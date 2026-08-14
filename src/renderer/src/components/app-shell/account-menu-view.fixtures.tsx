import { UpdateRestartControlView } from '../../../../features/updates/renderer'
import type { AccountMenuViewProps } from './account-menu-view'

const noOp = (): void => undefined

export const builderAvatar =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="32" fill="%232563eb"/%3E%3Ccircle cx="32" cy="24" r="11" fill="%23dbeafe"/%3E%3Cpath d="M13 55c2-12 10-18 19-18s17 6 19 18" fill="%23dbeafe"/%3E%3C/svg%3E'

export const connectedAccountMenuFixture = {
  username: '@builder',
  avatarUrl: builderAvatar,
  avatarFallback: 'TB',
  settingsLabel: 'Settings',
  settingsHref: '#/settings?section=account',
  onOpenSettings: noOp
} satisfies AccountMenuViewProps

export const disconnectedAccountMenuFixture = {
  username: 'Connect GitHub',
  avatarFallback: 'GH',
  settingsLabel: 'Settings',
  settingsHref: '#/settings?section=account',
  onOpenSettings: noOp
} satisfies AccountMenuViewProps

export const updateReadyAccountMenuFixture = {
  ...connectedAccountMenuFixture,
  updateControl: (
    <UpdateRestartControlView
      placement="sidebar"
      version="0.1.0-beta.8"
      isApplying={false}
      dialogOpen={false}
      activeWork={null}
      error={null}
      onRequestApply={noOp}
      onDialogOpenChange={noOp}
    />
  )
} satisfies AccountMenuViewProps
