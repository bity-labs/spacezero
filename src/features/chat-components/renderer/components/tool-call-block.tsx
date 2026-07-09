import * as React from 'react'
import { CaretDownIcon, CaretRightIcon, WrenchIcon } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error'

export type ToolCallViewModel = {
  id: string
  toolName: string
  arguments?: unknown
  output?: string
  result?: unknown
  error?: string
  status: ToolCallStatus
}

export type ToolCallBlockProps = {
  toolCall: ToolCallViewModel
  defaultExpanded?: boolean
  className?: string
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export function ToolCallBlock({
  toolCall,
  defaultExpanded = true,
  className
}: ToolCallBlockProps): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const statusTone = toolCall.status === 'error' ? 'text-destructive' : 'text-muted-foreground'

  return (
    <section className={cn('rounded-xl border border-border bg-card text-sm shadow-xs', className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <WrenchIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{toolCall.toolName}</span>
        </span>
        <span className={cn('flex items-center gap-2 text-xs', statusTone)}>
          {toolCall.status}
          {expanded ? <CaretDownIcon className="size-3" /> : <CaretRightIcon className="size-3" />}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {toolCall.arguments !== undefined ? (
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {formatValue(toolCall.arguments)}
            </pre>
          ) : null}
          {toolCall.output ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background p-2 text-xs" aria-live="polite">
              {toolCall.output}
            </pre>
          ) : null}
          {toolCall.result !== undefined ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-emerald-500/10 p-2 text-xs">
              {formatValue(toolCall.result)}
            </pre>
          ) : null}
          {toolCall.error ? (
            <div role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {toolCall.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
