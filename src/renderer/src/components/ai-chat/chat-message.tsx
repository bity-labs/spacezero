import { Message, MessageContent, MessageResponse } from '@renderer/components/ui/message'
import { cn } from '@renderer/lib/utils'

import type { AiChatMessage, AiChatMessagePart } from './ai-chat.types'
import { ChatThinkingBlock } from './chat-thinking-block'
import { ToolCallBlock } from './tool-call-block'
import { ToolConfirmationCard } from './tool-confirmation-card'

export type ChatMessageProps = {
  message: AiChatMessage
  className?: string
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
}

export function ChatMessage({
  message,
  className,
  onToolConfirmationResolve = noopToolConfirmationResolve
}: ChatMessageProps) {
  return (
    <Message
      className={cn(message.status === 'error' && 'text-destructive', className)}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) =>
          renderPart(part, index, onToolConfirmationResolve)
        )}
      </MessageContent>
    </Message>
  )
}

function renderPart(
  part: AiChatMessagePart,
  index: number,
  onToolConfirmationResolve: (callId: string, approved: boolean) => void
) {
  switch (part.type) {
    case 'text':
      return <MessageResponse key={index}>{part.text}</MessageResponse>
    case 'thinking':
      return <ChatThinkingBlock key={index} part={part} />
    case 'tool-call':
      return <ToolCallBlock key={index} {...part} />
    case 'tool-confirmation':
      return (
        <ToolConfirmationCard
          key={index}
          {...part}
          onResolve={onToolConfirmationResolve}
        />
      )
  }
}

function noopToolConfirmationResolve() {}
