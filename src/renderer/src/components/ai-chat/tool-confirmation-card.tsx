import * as React from 'react'
import { XIcon } from '@phosphor-icons/react'

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle
} from '@renderer/components/ui/confirmation'

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
  const approval =
    state === 'approved'
      ? { id: callId, approved: true as const }
      : state === 'denied'
        ? { id: callId, approved: false as const }
        : { id: callId }
  const confirmationState = state === 'pending' || state === 'resolving' ? 'approval-requested' : 'approval-responded'

  return (
    <Confirmation className={className} approval={approval} state={confirmationState}>
      <ConfirmationRequest>
        <ConfirmationTitle>
          {isResolving ? 'Resolving…' : 'Approval needed'} for{' '}
          <span className="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {toolName}
          </span>
        </ConfirmationTitle>
        <p className="text-muted-foreground">{summary}</p>
      </ConfirmationRequest>
      <ConfirmationAccepted>
        <ConfirmationTitle>Approved {toolName}</ConfirmationTitle>
      </ConfirmationAccepted>
      <ConfirmationRejected>
        <ConfirmationTitle>Denied {toolName}</ConfirmationTitle>
      </ConfirmationRejected>
      <ConfirmationActions>
        <ConfirmationAction disabled={disabled} aria-label="Approve tool use" onClick={() => onResolve(callId, true)}>
          Yes
        </ConfirmationAction>
        <ConfirmationAction
          variant="outline"
          disabled={disabled}
          aria-label="Deny tool use"
          onClick={() => onResolve(callId, false)}
        >
          <XIcon />
          No
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  )
}
