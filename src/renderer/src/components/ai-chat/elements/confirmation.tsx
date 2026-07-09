// Copied/adapted from Vercel AI Elements confirmation for Space Zero approvals.
import * as React from 'react'
import { ShieldCheckIcon } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'

export type ConfirmationProps = React.ComponentProps<'section'>

export function Confirmation({ className, ...props }: ConfirmationProps): React.JSX.Element {
  return <section className={cn('rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm', className)} {...props} />
}

export type ConfirmationBodyProps = React.ComponentProps<'div'>

export function ConfirmationBody({ className, children, ...props }: ConfirmationBodyProps): React.JSX.Element {
  return (
    <div className={cn('flex items-start gap-3', className)} {...props}>
      <ShieldCheckIcon className="mt-0.5 size-5 text-amber-600" />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  )
}

export type ConfirmationActionsProps = React.ComponentProps<'div'>

export function ConfirmationActions({ className, ...props }: ConfirmationActionsProps): React.JSX.Element {
  return <div className={cn('flex gap-2', className)} {...props} />
}
