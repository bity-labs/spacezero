import * as React from 'react'
import { XIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'

import { Confirmation, ConfirmationActions, ConfirmationBody } from './elements/confirmation'
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
    <Confirmation className={className}>
      <ConfirmationBody>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{statusLabel}</span>
          <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {toolName}
          </span>
        </div>
        <p className="text-muted-foreground">{summary}</p>
        <ConfirmationActions>
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
        </ConfirmationActions>
      </ConfirmationBody>
    </Confirmation>
  )
}
