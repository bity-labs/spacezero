import { Link, useRouterState } from '@tanstack/react-router'
import { GearSix } from '@phosphor-icons/react'

import { cn } from '../../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { buttonVariants } from '../ui/button'

export type AccountMenuProps = {
  username?: string
  avatarUrl?: string
  avatarFallback?: string
  settingsLabel?: string
  settingsTo?: '/' | '/settings'
}

export function AccountMenu({
  username = 'Guest',
  avatarUrl,
  avatarFallback = 'G',
  settingsLabel,
  settingsTo
}: AccountMenuProps): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const resolvedSettingsTo = settingsTo ?? (pathname === '/settings' ? '/' : '/settings')
  const resolvedSettingsLabel =
    settingsLabel ?? (resolvedSettingsTo === '/settings' ? 'Settings' : 'Close settings')
  return (
    <section className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Account menu">
      <Avatar className="size-8 bg-muted">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={username} /> : null}
        <AvatarFallback className="text-sm font-medium">{avatarFallback}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 text-muted-foreground">{username}</p>
      </div>

      <Link
        to={resolvedSettingsTo}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'text-muted-foreground'
        )}
        aria-label={resolvedSettingsLabel}
      >
        <GearSix className="h-5 w-5" aria-hidden="true" />
      </Link>
    </section>
  )
}
