// Adapted from AI Elements confirmation for Space Zero tool approvals.
import * as React from 'react'
import { ShieldCheckIcon, XIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

import type { ToolConfirmationState } from './types'

export type ToolConfirmationCardProps = {
  callId: string
  toolName: string
  summary: string
  state?: ToolConfirmationState
  onResolve: (callId: string, approved: boolean) => void
  className?: string
}

export function ToolConfirmationCard({
  callId,
  toolName,
  summary,
  state = 'pending',
  onResolve,
  className
}: ToolConfirmationCardProps): React.JSX.Element {
  const isPending = state === 'pending'
  const isResolving = state === 'resolving'
  const disabled = !isPending || isResolving
  const statusLabel =
    state === 'pending' ? 'Approval needed' : state === 'resolving' ? 'Resolving…' : state === 'approved' ? 'Approved' : 'Denied'

  return (
    <section className={cn('rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm', className)}>
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 size-5 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{statusLabel}</span>
            <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {toolName}
            </span>
          </div>
          <p className="text-muted-foreground">{summary}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              aria-label="Approve tool use"
              onClick={() => onResolve(callId, true)}
            >
              Yes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              aria-label="Deny tool use"
              onClick={() => onResolve(callId, false)}
            >
              <XIcon />
              No
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
