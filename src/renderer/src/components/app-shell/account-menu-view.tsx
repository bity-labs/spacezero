import type { ReactNode } from 'react'
import { GearSix, User } from '@phosphor-icons/react'

import { cn } from '../../lib/utils'
import {
  NotificationIconButton,
  type NotificationIconButtonProps
} from '../notification-icon-button'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { buttonVariants } from '../ui/button'

export type AccountMenuViewProps = {
  username: string
  avatarUrl?: string
  avatarFallback: string
  settingsLabel: string
  settingsHref: string
  notification?: NotificationIconButtonProps
  updateControl?: ReactNode
  onOpenSettings: () => void
}

export function AccountMenuView({
  username,
  avatarUrl,
  avatarFallback,
  settingsLabel,
  settingsHref,
  notification,
  updateControl,
  onOpenSettings
}: AccountMenuViewProps): React.JSX.Element {
  const isConnected = Boolean(avatarUrl)

  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Account menu">
      <Avatar className="size-8 bg-muted">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={username} /> : null}
        <AvatarFallback className="bg-muted text-muted-foreground">
          {isConnected ? (
            <span className="text-sm font-medium">{avatarFallback}</span>
          ) : (
            <User className="size-4" aria-hidden="true" />
          )}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <a
          href={settingsHref}
          className="truncate text-sm leading-5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={(event) => {
            event.preventDefault()
            onOpenSettings()
          }}
        >
          {username}
        </a>
      </div>

      {notification ? <NotificationIconButton {...notification} /> : updateControl}

      <a
        href={settingsHref}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'text-muted-foreground'
        )}
        aria-label={settingsLabel}
        onClick={(event) => {
          event.preventDefault()
          onOpenSettings()
        }}
      >
        <GearSix className="h-5 w-5" aria-hidden="true" />
      </a>
    </section>
  )
}
