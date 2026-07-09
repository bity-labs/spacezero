import * as React from 'react'

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart
} from '@renderer/components/ui/tool'

import type { ToolCallState, ToolCallViewModel } from './types'

export type ToolCallBlockProps = ToolCallViewModel & {
  defaultExpanded?: boolean
  className?: string
}

function toToolPartState(state: ToolCallState): ToolPart['state'] {
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

export function ToolCallBlock({
  callId,
  toolName,
  state,
  input,
  output,
  error,
  defaultExpanded,
  className
}: ToolCallBlockProps): React.JSX.Element {
  const toolState = toToolPartState(state)
  const shouldDefaultOpen = defaultExpanded ?? (state === 'running' || state === 'error')

  return (
    <Tool className={className} data-call-id={callId} defaultOpen={shouldDefaultOpen}>
      <ToolHeader type="dynamic-tool" toolName={toolName} state={toolState} />
      <ToolContent>
        {input !== undefined ? <ToolInput input={input} /> : null}
        <ToolOutput output={output} errorText={error} />
      </ToolContent>
    </Tool>
  )
}
