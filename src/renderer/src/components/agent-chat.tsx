import type { ReactNode } from 'react'

import { ChatTranscript, type AiChatMessage } from '@renderer/components/ai-chat'
import { cn } from '@renderer/lib/utils'

export type AgentChatMessage = AiChatMessage

export type AgentChatProps = {
  messages: AgentChatMessage[]
  composer?: ReactNode
  emptyState?: ReactNode
  className?: string
  contentClassName?: string
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
}

export function AgentChat({
  messages,
  composer,
  emptyState,
  className,
  contentClassName,
  onToolConfirmationResolve
}: AgentChatProps) {
  return (
    <section className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <ChatTranscript
        messages={messages}
        emptyState={emptyState}
        contentClassName={contentClassName}
        onToolConfirmationResolve={onToolConfirmationResolve}
      />
      {composer ? <div className="border-t p-4">{composer}</div> : null}
    </section>
  )
}
