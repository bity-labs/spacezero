// Copied/adapted from Vercel AI Elements tool for Space Zero tool-call types.
import * as React from 'react'
import { CaretDownIcon, CaretRightIcon, WrenchIcon } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'

import type { ToolCallState } from '../types'

export type ToolProps = React.ComponentProps<'section'>

export function Tool({ className, ...props }: ToolProps): React.JSX.Element {
  return <section className={cn('rounded-xl border border-border bg-card text-sm shadow-xs', className)} {...props} />
}

export type ToolHeaderProps = React.ComponentProps<'button'> & {
  toolName: string
  state: ToolCallState
  expanded: boolean
}

export function ToolHeader({ toolName, state, expanded, className, ...props }: ToolHeaderProps): React.JSX.Element {
  const statusTone = state === 'error' ? 'text-destructive' : 'text-muted-foreground'

  return (
    <button
      type="button"
      className={cn('flex w-full items-center justify-between gap-3 px-3 py-2 text-left', className)}
      aria-expanded={expanded}
      {...props}
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
  )
}

export type ToolContentProps = React.ComponentProps<'div'>

export function ToolContent({ className, ...props }: ToolContentProps): React.JSX.Element {
  return <div className={cn('space-y-3 border-t border-border px-3 py-3', className)} {...props} />
}

export type ToolValueProps = React.ComponentProps<'pre'> & {
  tone?: 'muted' | 'result' | 'default'
}

export function ToolValue({ tone = 'default', className, ...props }: ToolValueProps): React.JSX.Element {
  return (
    <pre
      className={cn(
        'overflow-x-auto whitespace-pre-wrap rounded-md p-2 text-xs',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'result' && 'bg-emerald-500/10',
        tone === 'default' && 'bg-background',
        className
      )}
      {...props}
    />
  )
}
