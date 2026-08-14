import type { ReactNode } from 'react'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'

export type SessionHostScreenState =
  | { kind: 'loading'; message: string }
  | {
      kind: 'error'
      message: string
      guidance?: string
      retryLabel?: string
      onRetry?: () => void
    }
  | { kind: 'ready'; alert?: string; content: ReactNode }

export type SessionHostScreenProps = {
  label: string
  state: SessionHostScreenState
  className?: string
}

export function SessionHostScreen({
  label,
  state,
  className
}: SessionHostScreenProps): React.JSX.Element {
  if (state.kind === 'loading') {
    return (
      <section
        aria-label={label}
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground',
          className
        )}
      >
        {state.message}
      </section>
    )
  }

  if (state.kind === 'error') {
    return (
      <section
        aria-label={label}
        className={cn('flex min-h-0 flex-1 items-center justify-center p-8', className)}
      >
        <Card className="w-full max-w-lg gap-4 p-6">
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
          {state.guidance ? (
            <p className="text-sm text-muted-foreground">{state.guidance}</p>
          ) : null}
          {state.onRetry ? (
            <Button className="self-end" onClick={state.onRetry}>
              {state.retryLabel ?? 'Retry'}
            </Button>
          ) : null}
        </Card>
      </section>
    )
  }

  return (
    <section
      aria-label={label}
      className={cn('flex min-h-0 flex-1 flex-col overflow-hidden bg-background', className)}
    >
      {state.alert ? (
        <Alert className="m-4 mb-0" variant="destructive">
          <AlertDescription>{state.alert}</AlertDescription>
        </Alert>
      ) : null}
      {state.content}
    </section>
  )
}
