import * as React from 'react'

import { Tool, ToolContent, ToolHeader, ToolValue } from './elements/tool'
import type { ToolCallViewModel } from './types'

export type ToolCallBlockProps = ToolCallViewModel & {
  defaultExpanded?: boolean
  className?: string
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
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
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? (state === 'running' || state === 'error'))

  return (
    <Tool className={className} data-call-id={callId}>
      <ToolHeader
        toolName={toolName}
        state={state}
        expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      />

      {expanded ? (
        <ToolContent>
          {input !== undefined ? <ToolValue tone="muted">{formatValue(input)}</ToolValue> : null}
          {output !== undefined && state !== 'success' ? (
            <ToolValue aria-live="polite">{formatValue(output)}</ToolValue>
          ) : null}
          {output !== undefined && state === 'success' ? (
            <ToolValue tone="result">{formatValue(output)}</ToolValue>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </ToolContent>
      ) : null}
    </Tool>
  )
}
