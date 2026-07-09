// Copied/adapted from Vercel AI Elements model-selector for Space Zero.
import * as React from 'react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

export type ModelSelectorRootProps = React.ComponentProps<'div'>

export function ModelSelectorRoot({ className, ...props }: ModelSelectorRootProps): React.JSX.Element {
  return <div className={cn('relative inline-block text-sm', className)} {...props} />
}

export type ModelSelectorTriggerProps = React.ComponentProps<typeof Button>

export function ModelSelectorTrigger({ className, ...props }: ModelSelectorTriggerProps): React.JSX.Element {
  return <Button className={cn(className)} type="button" variant="outline" size="sm" {...props} />
}

export type ModelSelectorContentProps = React.ComponentProps<'div'>

export function ModelSelectorContent({ className, ...props }: ModelSelectorContentProps): React.JSX.Element {
  return (
    <div
      className={cn('absolute z-50 mt-2 w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md', className)}
      {...props}
    />
  )
}

export type ModelSelectorListProps = React.ComponentProps<'div'>

export function ModelSelectorList({ className, ...props }: ModelSelectorListProps): React.JSX.Element {
  return <div role="listbox" className={cn('max-h-72 overflow-y-auto', className)} {...props} />
}

export type ModelSelectorItemProps = React.ComponentProps<'button'>

export function ModelSelectorItem({ className, ...props }: ModelSelectorItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="option"
      className={cn('flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  )
}
