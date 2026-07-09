import { Check, X } from '@phosphor-icons/react'

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
  type ConfirmationApproval
} from '@renderer/components/ui/confirmation'
import type { ToolState } from '@renderer/components/ui/tool'

import type { AiChatToolConfirmationState } from './ai-chat.types'

export type ToolConfirmationCardProps = {
  callId: string
  toolName: string
  summary: string
  state?: AiChatToolConfirmationState
  onResolve: (callId: string, approved: boolean) => void
}

export function ToolConfirmationCard({
  callId,
  toolName,
  summary,
  state = 'pending',
  onResolve
}: ToolConfirmationCardProps) {
  const isResolving = state === 'resolving'

  return (
    <Confirmation approval={toConfirmationApproval(callId, state)} state={toConfirmationState(state)}>
      <ConfirmationTitle>{toolName} requires approval</ConfirmationTitle>
      <ConfirmationRequest>
        <p>{summary}</p>
      </ConfirmationRequest>
      <ConfirmationAccepted>
        <div className="flex items-center gap-2 text-foreground">
          <Check className="size-4 text-green-600" aria-hidden="true" />
          <span>Approved</span>
        </div>
      </ConfirmationAccepted>
      <ConfirmationRejected>
        <div className="flex items-center gap-2 text-foreground">
          <X className="size-4 text-destructive" aria-hidden="true" />
          <span>Denied</span>
        </div>
      </ConfirmationRejected>
      <ConfirmationActions>
        <ConfirmationAction
          disabled={isResolving}
          onClick={() => onResolve(callId, false)}
          variant="outline"
        >
          Deny
        </ConfirmationAction>
        <ConfirmationAction disabled={isResolving} onClick={() => onResolve(callId, true)}>
          Approve
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  )
}

function toConfirmationApproval(
  callId: string,
  state: AiChatToolConfirmationState
): ConfirmationApproval {
  switch (state) {
    case 'approved':
      return { id: callId, approved: true }
    case 'denied':
      return { id: callId, approved: false }
    case 'pending':
    case 'resolving':
      return { id: callId }
  }
}

function toConfirmationState(state: AiChatToolConfirmationState): ToolState {
  switch (state) {
    case 'approved':
    case 'denied':
      return 'approval-responded'
    case 'pending':
    case 'resolving':
      return 'approval-requested'
  }
}
