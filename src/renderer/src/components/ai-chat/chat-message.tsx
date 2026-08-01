import { Message, MessageContent, MessageResponse } from '@renderer/components/ui/message'
import { cn } from '@renderer/lib/utils'

import type { AiChatMessage, AiChatMessagePart } from './ai-chat.types'
import { AgentActivityBlock, type AgentActivityPart } from './agent-activity-block'
import { ToolConfirmationCard } from './tool-confirmation-card'

export type ChatMessageProps = {
  message: AiChatMessage
  className?: string
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
  onOpenLink?: (url: string) => void | Promise<void>
}

export function ChatMessage({
  message,
  className,
  onToolConfirmationResolve = noopToolConfirmationResolve,
  onOpenLink
}: ChatMessageProps) {
  return (
    <Message
      className={cn(message.status === 'error' && 'text-destructive', className)}
      from={message.role}
    >
      <MessageContent>
        {groupActivityParts(
          message.parts,
          message.role === 'assistant' && message.status === 'streaming'
        ).map((part, index) =>
          renderPart(part, index, onToolConfirmationResolve, onOpenLink, message.activityDurationSeconds)
        )}
      </MessageContent>
    </Message>
  )
}

type RenderableChatPart =
  | Exclude<AiChatMessagePart, AgentActivityPart>
  | { type: 'agent-activity'; parts: AgentActivityPart[] }

function renderPart(
  part: RenderableChatPart,
  index: number,
  onToolConfirmationResolve: (callId: string, approved: boolean) => void,
  onOpenLink: ((url: string) => void | Promise<void>) | undefined,
  activityDurationSeconds: number | undefined
) {
  switch (part.type) {
    case 'text':
      return (
        <MessageResponse
          key={index}
          components={
            onOpenLink
              ? {
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      onClick={(event) => {
                        if (!href || !isHttpChatLink(href)) {
                          event.preventDefault()
                          return
                        }
                        event.preventDefault()
                        void onOpenLink(href)
                      }}
                    >
                      {children}
                    </a>
                  )
                }
              : undefined
          }
        >
          {part.text}
        </MessageResponse>
      )
    case 'tool-confirmation':
      return (
        <ToolConfirmationCard
          key={index}
          {...part}
          onResolve={onToolConfirmationResolve}
        />
      )
    case 'agent-activity':
      return <AgentActivityBlock key={index} durationSeconds={activityDurationSeconds} parts={part.parts} />
  }
}

function groupActivityParts(
  parts: readonly AiChatMessagePart[],
  showStreamingPlaceholder = false
): RenderableChatPart[] {
  const activityParts = parts.filter(isActivityPart)
  if (activityParts.length === 0) {
    return showStreamingPlaceholder
      ? [{ type: 'agent-activity', parts: [streamingThinkingPlaceholder] }]
      : parts.filter(isNonActivityPart)
  }

  let insertedActivity = false
  const grouped: RenderableChatPart[] = []

  for (const part of parts) {
    if (isActivityPart(part)) {
      if (!insertedActivity) {
        grouped.push({ type: 'agent-activity', parts: activityParts })
        insertedActivity = true
      }
      continue
    }

    grouped.push(part)
  }

  return grouped
}

const streamingThinkingPlaceholder: AgentActivityPart = {
  type: 'thinking',
  text: '',
  state: 'streaming',
  collapsed: true
}

function isActivityPart(part: AiChatMessagePart): part is AgentActivityPart {
  return part.type === 'thinking' || part.type === 'tool-call'
}

function isNonActivityPart(part: AiChatMessagePart): part is Exclude<AiChatMessagePart, AgentActivityPart> {
  return !isActivityPart(part)
}

function noopToolConfirmationResolve() {}

function isHttpChatLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
