import type { ReactNode } from 'react'
import { GearSix } from '@phosphor-icons/react'

import { cn } from '../../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { buttonVariants } from '../ui/button'

export type AccountMenuViewProps = {
  username: string
  avatarUrl?: string
  avatarFallback: string
  settingsLabel: string
  settingsHref: string
  updateControl?: ReactNode
  onOpenSettings: () => void
}

export function AccountMenuView({
  username,
  avatarUrl,
  avatarFallback,
  settingsLabel,
  settingsHref,
  updateControl,
  onOpenSettings
}: AccountMenuViewProps): React.JSX.Element {
  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Account menu">
      <Avatar className="size-8 bg-muted">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={username} /> : null}
        <AvatarFallback className="text-sm font-medium">{avatarFallback}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 text-muted-foreground">{username}</p>
      </div>

      {updateControl}

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
