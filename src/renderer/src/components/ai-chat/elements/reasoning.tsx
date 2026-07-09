// Copied/adapted from Vercel AI Elements reasoning for Space Zero thinking parts.
import * as React from 'react'

import { cn } from '@renderer/lib/utils'

export type ReasoningProps = React.ComponentProps<'details'> & {
  isStreaming?: boolean
  collapsed?: boolean
}

export function Reasoning({ isStreaming = false, collapsed, className, ...props }: ReasoningProps): React.JSX.Element {
  return (
    <details
      className={cn('rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground', className)}
      open={collapsed === undefined ? isStreaming : !collapsed}
      {...props}
    />
  )
}

export type ReasoningTriggerProps = React.ComponentProps<'summary'> & {
  isStreaming?: boolean
}

export function ReasoningTrigger({ isStreaming = false, className, children, ...props }: ReasoningTriggerProps): React.JSX.Element {
  return (
    <summary className={cn('cursor-pointer text-xs font-semibold uppercase tracking-wide', className)} {...props}>
      {children ?? (isStreaming ? 'Thinking…' : 'Thinking')}
    </summary>
  )
}

export type ReasoningContentProps = React.ComponentProps<'div'>

export function ReasoningContent({ className, ...props }: ReasoningContentProps): React.JSX.Element {
  return <div className={cn('mt-2 whitespace-pre-wrap leading-relaxed', className)} {...props} />
}
