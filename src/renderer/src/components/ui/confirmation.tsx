import type { ComponentProps, ReactNode } from 'react'
import { createContext, useContext, useMemo } from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import type { ToolState } from '@renderer/components/ui/tool'
import { cn } from '@renderer/lib/utils'

export type ConfirmationApproval =
  | {
      id: string
      approved?: never
      reason?: never
    }
  | {
      id: string
      approved: boolean
      reason?: string
    }
  | undefined

export type ConfirmationContextValue = {
  approval: ConfirmationApproval
  state: ToolState
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null)

function useConfirmation() {
  const context = useContext(ConfirmationContext)

  if (!context) {
    throw new Error('Confirmation components must be used within Confirmation')
  }

  return context
}

export type ConfirmationProps = ComponentProps<typeof Alert> & {
  approval?: ConfirmationApproval
  state: ToolState
}

export function Confirmation({ className, approval, state, ...props }: ConfirmationProps) {
  const contextValue = useMemo(() => ({ approval, state }), [approval, state])

  if (!approval || state === 'input-streaming' || state === 'input-available') {
    return null
  }

  return (
    <ConfirmationContext.Provider value={contextValue}>
      <Alert className={cn('flex flex-col gap-2', className)} {...props} />
    </ConfirmationContext.Provider>
  )
}

export type ConfirmationTitleProps = ComponentProps<typeof AlertDescription>

export function ConfirmationTitle({ className, ...props }: ConfirmationTitleProps) {
  return <AlertDescription className={cn('inline', className)} {...props} />
}

export type ConfirmationRequestProps = {
  children?: ReactNode
}

export function ConfirmationRequest({ children }: ConfirmationRequestProps) {
  const { state } = useConfirmation()

  if (state !== 'approval-requested') {
    return null
  }

  return children
}

export type ConfirmationAcceptedProps = {
  children?: ReactNode
}

export function ConfirmationAccepted({ children }: ConfirmationAcceptedProps) {
  const { approval, state } = useConfirmation()

  if (
    !approval?.approved ||
    (state !== 'approval-responded' &&
      state !== 'output-denied' &&
      state !== 'output-available')
  ) {
    return null
  }

  return children
}

export type ConfirmationRejectedProps = {
  children?: ReactNode
}

export function ConfirmationRejected({ children }: ConfirmationRejectedProps) {
  const { approval, state } = useConfirmation()

  if (
    approval?.approved !== false ||
    (state !== 'approval-responded' &&
      state !== 'output-denied' &&
      state !== 'output-available')
  ) {
    return null
  }

  return children
}

export type ConfirmationActionsProps = ComponentProps<'div'>

export function ConfirmationActions({ className, ...props }: ConfirmationActionsProps) {
  const { state } = useConfirmation()

  if (state !== 'approval-requested') {
    return null
  }

  return <div className={cn('flex items-center justify-end gap-2 self-end', className)} {...props} />
}

export type ConfirmationActionProps = ComponentProps<typeof Button>

export function ConfirmationAction(props: ConfirmationActionProps) {
  return <Button className="h-8 px-3 text-sm" type="button" {...props} />
}
