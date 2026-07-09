import { CheckCircle, CaretDown, Circle, Clock, Wrench, XCircle } from '@phosphor-icons/react'
import type { ComponentProps, ReactNode } from 'react'
import { isValidElement } from 'react'

import { Badge } from '@renderer/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { cn } from '@renderer/lib/utils'

export type ToolState =
  | 'approval-requested'
  | 'approval-responded'
  | 'input-available'
  | 'input-streaming'
  | 'output-available'
  | 'output-denied'
  | 'output-error'

export type ToolProps = ComponentProps<typeof Collapsible>

export function Tool({ className, ...props }: ToolProps) {
  return (
    <Collapsible
      className={cn('group not-prose mb-4 w-full rounded-md border bg-card', className)}
      {...props}
    />
  )
}

export type ToolHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, 'type'> & {
  title?: string
  type: string
  state: ToolState
  toolName?: string
}

const statusLabels: Record<ToolState, string> = {
  'approval-requested': 'Awaiting Approval',
  'approval-responded': 'Responded',
  'input-available': 'Running',
  'input-streaming': 'Pending',
  'output-available': 'Completed',
  'output-denied': 'Denied',
  'output-error': 'Error'
}

const statusIcons: Record<ToolState, ReactNode> = {
  'approval-requested': <Clock className="size-4 text-yellow-600" />,
  'approval-responded': <CheckCircle className="size-4 text-blue-600" />,
  'input-available': <Clock className="size-4 animate-pulse" />,
  'input-streaming': <Circle className="size-4" />,
  'output-available': <CheckCircle className="size-4 text-green-600" />,
  'output-denied': <XCircle className="size-4 text-orange-600" />,
  'output-error': <XCircle className="size-4 text-red-600" />
}

export function ToolStatusBadge({ state }: { state: ToolState }) {
  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {statusIcons[state]}
      {statusLabels[state]}
    </Badge>
  )
}

export function ToolHeader({ className, title, type, state, toolName, ...props }: ToolHeaderProps) {
  const derivedName = toolName ?? type.split('-').slice(1).join('-')

  return (
    <CollapsibleTrigger
      className={cn('flex w-full items-center justify-between gap-4 p-3', className)}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Wrench className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{title ?? derivedName}</span>
        <ToolStatusBadge state={state} />
      </div>
      <CaretDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  )
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>

export function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent
      className={cn('space-y-4 p-4 text-popover-foreground outline-none', className)}
      {...props}
    />
  )
}

export type ToolInputProps = ComponentProps<'div'> & {
  input: unknown
}

export function ToolInput({ className, input, ...props }: ToolInputProps) {
  if (input === undefined) {
    return null
  }

  return (
    <div className={cn('space-y-2 overflow-hidden', className)} {...props}>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Parameters
      </h4>
      <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">
        {formatToolValue(input)}
      </pre>
    </div>
  )
}

export type ToolOutputProps = ComponentProps<'div'> & {
  output?: unknown
  errorText?: string
}

export function ToolOutput({ className, output, errorText, ...props }: ToolOutputProps) {
  if (!(output || errorText)) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {errorText ? 'Error' : 'Result'}
      </h4>
      <div
        className={cn(
          'overflow-x-auto rounded-md p-3 text-xs',
          errorText ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-foreground'
        )}
      >
        {errorText ? <div>{errorText}</div> : renderToolValue(output)}
      </div>
    </div>
  )
}

function renderToolValue(value: unknown) {
  if (isValidElement(value)) {
    return value
  }

  return <pre>{formatToolValue(value)}</pre>
}

function formatToolValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value, null, 2)
}
