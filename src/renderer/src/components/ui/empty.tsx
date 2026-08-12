import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@renderer/lib/utils'
import { Heading, Text } from '@renderer/components/ui/typography'

function Empty({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="empty"
      className={cn('flex min-h-32 flex-col items-center justify-center gap-4 p-6 text-center', className)}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="empty-header" className={cn('space-y-1', className)} {...props} />
}

function EmptyIcon({ className, children, ...props }: ComponentProps<'div'>): React.JSX.Element | null {
  if (!children) return null

  return (
    <div
      data-slot="empty-icon"
      className={cn('mb-3 flex justify-center text-muted-foreground [&_svg]:size-5', className)}
      {...props}
    >
      {children}
    </div>
  )
}

function EmptyTitle({ className, ...props }: ComponentProps<'h3'>): React.JSX.Element {
  return <Heading data-slot="empty-title" as="h3" level="h4" className={className} {...props} />
}

function EmptyDescription({ className, ...props }: ComponentProps<'p'>): React.JSX.Element {
  return (
    <Text
      data-slot="empty-description"
      variant="subtle"
      className={cn('mx-auto max-w-sm', className)}
      {...props}
    />
  )
}

function EmptyActions({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="empty-actions"
      className={cn('flex flex-wrap items-center justify-center gap-2', className)}
      {...props}
    />
  )
}

type EmptyStateProps = ComponentProps<typeof Empty> & {
  icon?: ReactNode
  title: string
  description?: string
  actions?: ReactNode
}

function EmptyState({
  icon,
  title,
  description,
  actions,
  children,
  ...props
}: EmptyStateProps): React.JSX.Element {
  return (
    <Empty {...props}>
      {children ?? (
        <>
          <EmptyHeader>
            <EmptyIcon>{icon}</EmptyIcon>
            <EmptyTitle>{title}</EmptyTitle>
            {description ? <EmptyDescription>{description}</EmptyDescription> : null}
          </EmptyHeader>
          {actions ? <EmptyActions>{actions}</EmptyActions> : null}
        </>
      )}
    </Empty>
  )
}

export { Empty, EmptyActions, EmptyDescription, EmptyHeader, EmptyIcon, EmptyState, EmptyTitle }
