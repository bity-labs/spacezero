import * as React from 'react'

import { cn } from '@renderer/lib/utils'

function Avatar({ className, ...props }: React.ComponentProps<'span'>): React.JSX.Element {
  return (
    <span
      data-slot="avatar"
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
}

function AvatarImage({ className, alt = '', ...props }: React.ComponentProps<'img'>): React.JSX.Element {
  return <img data-slot="avatar-image" alt={alt} className={cn('aspect-square size-full object-cover', className)} {...props} />
}

function AvatarFallback({ className, ...props }: React.ComponentProps<'span'>): React.JSX.Element {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn('flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarImage }
