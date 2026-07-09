// Adapted from AI Elements tool for Space Zero tool-call state and Phosphor icons.
import * as React from 'react'
import { CaretDownIcon, CaretRightIcon, WrenchIcon } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'

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
  const statusTone = state === 'error' ? 'text-destructive' : 'text-muted-foreground'

  return (
    <section className={cn('rounded-xl border border-border bg-card text-sm shadow-xs', className)} data-call-id={callId}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <WrenchIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{toolName}</span>
        </span>
        <span className={cn('flex items-center gap-2 text-xs', statusTone)}>
          {state}
          {expanded ? <CaretDownIcon className="size-3" /> : <CaretRightIcon className="size-3" />}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {input !== undefined ? (
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {formatValue(input)}
            </pre>
          ) : null}
          {output !== undefined && state !== 'success' ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-background p-2 text-xs" aria-live="polite">
              {formatValue(output)}
            </pre>
          ) : null}
          {output !== undefined && state === 'success' ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-emerald-500/10 p-2 text-xs">
              {formatValue(output)}
            </pre>
          ) : null}
          {error ? (
            <div role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
