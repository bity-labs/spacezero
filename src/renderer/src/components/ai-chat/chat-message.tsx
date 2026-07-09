import * as React from 'react'

import { cn } from '@renderer/lib/utils'

import { Reasoning, ReasoningContent, ReasoningTrigger } from '@renderer/components/ui/reasoning'
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
      return <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{part.text}</div>
    case 'thinking':
      return (
        <Reasoning isStreaming={part.state === 'streaming'} defaultOpen={part.collapsed === undefined ? undefined : !part.collapsed}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
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
