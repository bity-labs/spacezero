import * as React from 'react'

import { cn } from '@renderer/lib/utils'

export type SessionStatus = 'running' | 'idle'

export type SessionStatusIndicatorProps = {
  status: SessionStatus
  className?: string
}

export function SessionStatusIndicator({ status, className }: SessionStatusIndicatorProps): React.JSX.Element {
  const isRunning = status === 'running'

  return (
    <div
      role="status"
      data-status={status}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium',
        isRunning
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border bg-muted text-muted-foreground',
        className
      )}
    >
      <span
        className={cn(
          'size-2 rounded-full',
          isRunning ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/60'
        )}
        aria-hidden="true"
      />
      {isRunning ? 'Running' : 'Idle'}
    </div>
  )
}
