import * as React from 'react'
import { PaperPlaneTiltIcon } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'

import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from './elements/prompt-input'

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

  function submit(): void {
    const text = value.trim()
    if (!text || disabled) return

    onSubmit(text)
    setValue('')
  }

  return (
    <PromptInput className={cn(className)} onSubmit={submit}>
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
        className="max-h-48 min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <PromptInputFooter className="justify-between">
        <div className="flex flex-wrap items-center gap-2">{footerLeading}</div>
        <PromptInputSubmit disabled={disabled || !value.trim()} aria-label="Send message">
          <PaperPlaneTiltIcon />
          Send
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
  )
}
