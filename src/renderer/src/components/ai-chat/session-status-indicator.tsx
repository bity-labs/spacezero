import { SpinnerGap } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'

import type { AiChatSessionStatus } from './ai-chat.types'

export type SessionStatusIndicatorProps = {
  status: AiChatSessionStatus
  className?: string
  label?: string
}

export function SessionStatusIndicator({ status, className, label }: SessionStatusIndicatorProps) {
  const statusLabel = label ?? (status === 'running' ? 'Session running' : 'Session idle')

  if (status === 'running') {
    return (
      <SpinnerGap
        aria-label={statusLabel}
        className={cn('size-3 animate-spin text-primary', className)}
        role="status"
      />
    )
  }

  return (
    <span
      aria-label={statusLabel}
      className={cn('inline-block size-2.5 rounded-full bg-muted-foreground/45', className)}
      role="status"
    />
  )
}
