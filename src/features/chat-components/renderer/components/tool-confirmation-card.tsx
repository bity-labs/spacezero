import * as React from 'react'
import { ShieldCheckIcon, XIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

export type ToolConfirmationStatus = 'pending' | 'approved' | 'denied'

export type ToolConfirmationRequest = {
  callId: string
  toolName: string
  summary: string
  status?: ToolConfirmationStatus
}

export type ToolConfirmationResolution = {
  callId: string
  approved: boolean
}

export type ToolConfirmationCardProps = {
  request: ToolConfirmationRequest
  onResolve: (resolution: ToolConfirmationResolution) => void
  className?: string
}

export function ToolConfirmationCard({
  request,
  onResolve,
  className
}: ToolConfirmationCardProps): React.JSX.Element {
  const status = request.status ?? 'pending'
  const isPending = status === 'pending'
  const statusLabel = status === 'pending' ? 'Approval needed' : status === 'approved' ? 'Approved' : 'Denied'

  return (
    <section className={cn('rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm', className)}>
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="mt-0.5 size-5 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{statusLabel}</span>
            <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {request.toolName}
            </span>
          </div>
          <p className="text-muted-foreground">{request.summary}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!isPending}
              aria-label="Approve tool use"
              onClick={() => onResolve({ callId: request.callId, approved: true })}
            >
              Yes
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!isPending}
              aria-label="Deny tool use"
              onClick={() => onResolve({ callId: request.callId, approved: false })}
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
