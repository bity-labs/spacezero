import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolState
} from '@renderer/components/ui/tool'

import type { AiChatToolCallState } from './ai-chat.types'

export type ToolCallBlockProps = {
  callId: string
  toolName: string
  state: AiChatToolCallState
  input?: unknown
  output?: unknown
  error?: string
  defaultExpanded?: boolean
}

export function ToolCallBlock({
  callId,
  toolName,
  state,
  input,
  output,
  error,
  defaultExpanded
}: ToolCallBlockProps) {
  const expanded = defaultExpanded ?? (state === 'running' || state === 'error')

  return (
    <Tool defaultOpen={expanded} data-call-id={callId}>
      <ToolHeader title={toolName} type={`tool-${toolName}`} state={toToolState(state)} />
      <ToolContent>
        <ToolInput input={input} />
        <ToolOutput output={output} errorText={error} />
      </ToolContent>
    </Tool>
  )
}

function toToolState(state: AiChatToolCallState): ToolState {
  switch (state) {
    case 'pending':
      return 'input-streaming'
    case 'running':
      return 'input-available'
    case 'success':
      return 'output-available'
    case 'error':
      return 'output-error'
  }
}
