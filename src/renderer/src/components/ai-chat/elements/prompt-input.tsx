// Copied/adapted from Vercel AI Elements prompt-input for Space Zero.
// This local source intentionally uses Space Zero props and no AI SDK runtime types.
import * as React from 'react'

import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'

export type PromptInputProps = Omit<React.ComponentProps<'form'>, 'onSubmit'> & {
  onSubmit: (text: string) => void
}

export function PromptInput({ className, onSubmit, children, ...props }: PromptInputProps): React.JSX.Element {
  return (
    <form
      className={cn('rounded-xl border border-border bg-card p-2 shadow-xs', className)}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        onSubmit(String(data.get('message') ?? ''))
      }}
      {...props}
    >
      {children}
    </form>
  )
}

export type PromptInputTextareaProps = React.ComponentProps<typeof Textarea>

export function PromptInputTextarea({ className, ...props }: PromptInputTextareaProps): React.JSX.Element {
  return (
    <Textarea
      className={cn('max-h-48 min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0', className)}
      name="message"
      {...props}
    />
  )
}

export type PromptInputFooterProps = React.ComponentProps<'div'>

export function PromptInputFooter({ className, ...props }: PromptInputFooterProps): React.JSX.Element {
  return <div className={cn('mt-2 flex justify-end', className)} {...props} />
}

export type PromptInputSubmitProps = React.ComponentProps<typeof Button>

export function PromptInputSubmit({ className, ...props }: PromptInputSubmitProps): React.JSX.Element {
  return <Button className={cn(className)} type="submit" size="sm" {...props} />
}
