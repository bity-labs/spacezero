// Uses shadcn chat message/bubble and AI Elements reasoning/tool patterns with Space Zero message parts.
import * as React from 'react'

import { cn } from '@renderer/lib/utils'

import { ToolCallBlock } from './tool-call-block'
import { ToolConfirmationCard } from './tool-confirmation-card'
import type { AiChatMessage as AiChatMessageData, AiChatMessagePart } from './types'

export type ChatMessageProps = {
  message: AiChatMessageData
  onResolveToolConfirmation?: (callId: string, approved: boolean) => void
  className?: string
}

function ChatMessagePartView({
  part,
  onResolveToolConfirmation
}: {
  part: AiChatMessagePart
  onResolveToolConfirmation?: (callId: string, approved: boolean) => void
}): React.JSX.Element | null {
  switch (part.type) {
    case 'text':
      return (
        <div className="whitespace-pre-wrap rounded-2xl border border-border bg-card px-3 py-2 text-sm leading-relaxed text-card-foreground shadow-xs">
          {part.text}
        </div>
      )
    case 'thinking':
      return (
        <details
          className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
          open={part.collapsed === undefined ? part.state === 'streaming' : !part.collapsed}
        >
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">
            {part.state === 'streaming' ? 'Thinking…' : 'Thinking'}
          </summary>
          <div className="mt-2 whitespace-pre-wrap leading-relaxed">{part.text}</div>
        </details>
      )
    case 'tool-call':
      return <ToolCallBlock {...part} />
    case 'tool-confirmation':
      return <ToolConfirmationCard {...part} onResolve={onResolveToolConfirmation ?? (() => undefined)} />
    default:
      return null
  }
}

export function ChatMessage({ message, onResolveToolConfirmation, className }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === 'user'

  return (
    <article
      data-testid={`chat-message-${message.id}`}
      data-role={message.role}
      data-streaming={message.status === 'streaming' ? 'true' : undefined}
      aria-live={message.status === 'streaming' ? 'polite' : undefined}
      className={cn('flex w-full gap-3 py-3', isUser ? 'justify-end' : 'justify-start', className)}
    >
      <div className={cn('max-w-[78%] space-y-2', isUser && 'items-end')}>
        <div className={cn('text-xs font-medium text-muted-foreground', isUser && 'text-right')}>
          {isUser ? 'You' : 'Assistant'}
        </div>

        {message.parts.map((part, index) => {
          const key = part.id ?? `${message.id}-${part.type}-${index}`
          const isUserText = isUser && part.type === 'text'

          if (isUserText) {
            return (
              <div
                key={key}
                className="whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground shadow-xs"
              >
                {part.text}
              </div>
            )
          }

          return <ChatMessagePartView key={key} part={part} onResolveToolConfirmation={onResolveToolConfirmation} />
        })}
      </div>
    </article>
  )
}
