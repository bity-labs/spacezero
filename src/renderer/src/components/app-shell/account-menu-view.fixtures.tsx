import { UpdateRestartControlView } from '../../../../features/updates/renderer'
import type { AccountMenuViewProps } from './account-menu-view'

const noOp = (): void => undefined

export const builderAvatar = 'https://avatars.githubusercontent.com/u/101003754?v=4&size=64'

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
  avatarUrl: undefined,
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
