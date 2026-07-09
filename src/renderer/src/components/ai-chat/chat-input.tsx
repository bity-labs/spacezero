import { PaperPlaneTilt } from '@phosphor-icons/react'
import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react'

import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'

export type ChatInputProps = {
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  onSubmit: (text: string) => void
  className?: string
}

export function ChatInput({
  disabled = false,
  placeholder = 'Ask the agent anything...',
  autoFocus = false,
  onSubmit,
  className
}: ChatInputProps) {
  const [text, setText] = useState('')
  const canSubmit = !disabled && text.trim().length > 0

  const submitText = useCallback(() => {
    const submittedText = text.trim()

    if (disabled || submittedText.length === 0) {
      return
    }

    onSubmit(submittedText)
    setText('')
  }, [disabled, onSubmit, text])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      submitText()
    },
    [submitText]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
        return
      }

      event.preventDefault()
      submitText()
    },
    [submitText]
  )

  return (
    <form className={cn('flex gap-2', className)} onSubmit={handleSubmit}>
      <Textarea
        aria-label="Agent prompt"
        autoFocus={autoFocus}
        className="min-h-10 resize-none"
        disabled={disabled}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        value={text}
      />
      <Button type="submit" size="icon" aria-label="Send message" disabled={!canSubmit}>
        <PaperPlaneTilt className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  )
}
