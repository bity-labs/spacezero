import * as React from 'react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage
} from '@renderer/components/ui/prompt-input'
import { cn } from '@renderer/lib/utils'

export type ChatInputProps = {
  onSubmit: (text: string) => void
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  footerLeading?: React.ReactNode
  className?: string
}

export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = 'Message Space Zero…',
  autoFocus,
  footerLeading,
  className
}: ChatInputProps): React.JSX.Element {
  const [value, setValue] = React.useState('')

  function submit(message: PromptInputMessage): void {
    submitText(message.text)
  }

  function submitText(rawText: string): void {
    const text = rawText.trim()
    if (!text || disabled) return

    onSubmit(text)
    setValue('')
  }

  return (
    <PromptInput className={cn(className)} onSubmit={submit}>
      <PromptInputBody>
        <label className="sr-only" htmlFor="chat-input-message">
          Message
        </label>
        <PromptInputTextarea
          id="chat-input-message"
          name="message"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="max-h-48 min-h-20"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submitText(value)
            }
          }}
        />
      </PromptInputBody>
      <PromptInputFooter className="justify-between">
        <div className="flex flex-wrap items-center gap-2">{footerLeading}</div>
        <PromptInputSubmit
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          onClick={(event) => {
            event.preventDefault()
            submitText(value)
          }}
        >
          Send
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
  )
}
