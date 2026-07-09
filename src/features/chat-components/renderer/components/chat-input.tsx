import * as React from 'react'
import { PaperPlaneTiltIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'

export type ChatInputProps = {
  onSubmit: (text: string) => void
  isRunning?: boolean
  placeholder?: string
  className?: string
}

export function ChatInput({
  onSubmit,
  isRunning = false,
  placeholder = 'Message Space Zero…',
  className
}: ChatInputProps): React.JSX.Element {
  const [value, setValue] = React.useState('')

  function submit(): void {
    const text = value.trim()
    if (!text || isRunning) return

    onSubmit(text)
    setValue('')
  }

  return (
    <form
      className={cn('rounded-xl border border-border bg-card p-2 shadow-xs', className)}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="sr-only" htmlFor="chat-input-message">
        Message
      </label>
      <Textarea
        id="chat-input-message"
        value={value}
        placeholder={placeholder}
        disabled={isRunning}
        className="max-h-48 min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" disabled={isRunning || !value.trim()} aria-label="Send message">
          <PaperPlaneTiltIcon />
          Send
        </Button>
      </div>
    </form>
  )
}
