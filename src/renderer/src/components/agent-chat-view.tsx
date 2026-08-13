import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  ChatInput,
  ChatTranscript,
  type AiChatMessage,
  type AiChatThinkingLevel,
  type ChatInputActiveAgentDefinition,
  type ChatInputAgentDefinition,
  type ChatInputCommand,
  type ChatInputHistoryItem,
  type ChatInputKnowledgeBaseMentionResult,
  type ChatInputModel,
  type ChatInputSkill,
  type ChatInputSubmitFile
} from '@renderer/components/ai-chat'
import { cn } from '@renderer/lib/utils'
import type { AgentDefinitionReference } from '@shared/agent-protocol'

export type AgentChatViewProps = {
  sessionId: string
  messages: AiChatMessage[]
  status?: 'idle' | 'running'
  error?: string
  placeholder?: string
  commands?: ChatInputCommand[]
  historyItems?: ChatInputHistoryItem[]
  skills?: ChatInputSkill[]
  models?: ChatInputModel[]
  selectedModelId?: string
  thinkingLevel?: AiChatThinkingLevel
  agentDefinitions?: ChatInputAgentDefinition[]
  selectedAgentDefinitionId?: string
  activeAgentDefinition?: ChatInputActiveAgentDefinition
  agentDefinitionLocked?: boolean
  composer?: ReactNode
  emptyState?: ReactNode
  className?: string
  contentClassName?: string
  onSubmit?: (
    text: string,
    options?: { agentDefinition?: AgentDefinitionReference }
  ) => void | Promise<void>
  onCommand?: (commandName: string) => void | Promise<void>
  onHistorySelect?: (historyItemId: string) => void | Promise<void>
  onHistoryDismiss?: () => void
  onAbort?: () => void
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
  onOpenLink?: (url: string) => void | Promise<void>
  onModelChange?: (modelId: string) => void
  onThinkingChange?: (level: AiChatThinkingLevel) => void
  onAgentDefinitionChange?: (definitionId: string | undefined) => void
  onAgentDefinitionPickerOpen?: () => void
  resolveFilePath?: (file: File) => string
  loadKnowledgeBaseMentionPaths?: () => Promise<ChatInputKnowledgeBaseMentionResult>
}

export function AgentChatView({
  sessionId,
  messages,
  status = 'idle',
  error,
  placeholder,
  commands,
  historyItems,
  skills,
  models,
  selectedModelId,
  thinkingLevel,
  agentDefinitions,
  selectedAgentDefinitionId,
  activeAgentDefinition,
  agentDefinitionLocked,
  composer,
  emptyState,
  className,
  contentClassName,
  onSubmit,
  onCommand,
  onHistorySelect,
  onHistoryDismiss,
  onAbort,
  onToolConfirmationResolve,
  onOpenLink,
  onModelChange,
  onThinkingChange,
  onAgentDefinitionChange,
  onAgentDefinitionPickerOpen,
  resolveFilePath,
  loadKnowledgeBaseMentionPaths
}: AgentChatViewProps) {
  const [isSubmitPending, setIsSubmitPending] = useState(false)

  useEffect(() => {
    if (status !== 'running' || !onAbort) return undefined

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.repeat) return
      event.preventDefault()
      onAbort?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onAbort, status])

  useEffect(() => {
    if (status !== 'running' && !hasAssistantActivity(messages)) return undefined

    const timer = window.setTimeout(() => setIsSubmitPending(false), 0)
    return () => window.clearTimeout(timer)
  }, [messages, status])

  const displayMessages = useMemo(
    () =>
      withOptimisticThinkingMessage(messages, sessionId, isSubmitPending || status === 'running'),
    [isSubmitPending, messages, sessionId, status]
  )

  const defaultComposer = (
    <ChatInput
      models={models}
      skills={skills}
      commands={commands}
      historyItems={historyItems}
      agentDefinitions={agentDefinitions}
      selectedAgentDefinitionId={selectedAgentDefinitionId}
      activeAgentDefinition={activeAgentDefinition}
      agentDefinitionLocked={agentDefinitionLocked}
      onAgentDefinitionChange={onAgentDefinitionChange}
      onAgentDefinitionPickerOpen={onAgentDefinitionPickerOpen}
      selectedModelId={selectedModelId}
      thinkingLevel={thinkingLevel}
      onModelChange={onModelChange}
      onThinkingChange={onThinkingChange}
      onCommand={onCommand}
      onHistorySelect={onHistorySelect}
      onHistoryDismiss={onHistoryDismiss}
      onSubmit={async ({ text, files, agentDefinitionId }) => {
        setIsSubmitPending(true)
        try {
          const prompt = appendFilesAsContext(text, files)
          await onSubmit?.(
            prompt,
            agentDefinitionId ? { agentDefinition: { id: agentDefinitionId } } : undefined
          )
        } catch (error) {
          setIsSubmitPending(false)
          throw error
        }
      }}
      onAbort={onAbort}
      resolveFilePath={resolveFilePath}
      loadKnowledgeBaseMentionPaths={loadKnowledgeBaseMentionPaths}
      placeholder={placeholder}
      status={status === 'running' ? 'streaming' : 'ready'}
      className="rounded-2xl bg-muted/80 shadow-lg shadow-black/10 backdrop-blur"
    />
  )
  const composerContent = composer === undefined ? defaultComposer : composer

  return (
    <section
      className={cn(
        'relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden',
        className
      )}
    >
      {error ? (
        <div
          className="absolute inset-x-6 top-3 z-20 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <ChatTranscript
        messages={displayMessages}
        emptyState={emptyState}
        contentClassName={contentClassName}
        onToolConfirmationResolve={onToolConfirmationResolve}
        onOpenLink={onOpenLink}
      />
      {composerContent ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-6 pb-6 pt-16">
          <div className="pointer-events-auto w-full">{composerContent}</div>
        </div>
      ) : null}
    </section>
  )
}

function withOptimisticThinkingMessage(
  messages: AiChatMessage[],
  sessionId: string,
  shouldShow: boolean
): AiChatMessage[] {
  if (!shouldShow || hasAssistantActivity(messages)) return messages

  return [
    ...messages,
    {
      id: `${sessionId}-optimistic-thinking`,
      role: 'assistant',
      status: 'streaming',
      parts: []
    }
  ]
}

function hasAssistantActivity(messages: readonly AiChatMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === 'assistant' && (message.status === 'streaming' || message.parts.length > 0)
  )
}

function appendFilesAsContext(text: string, files: ChatInputSubmitFile[]): string {
  if (files.length === 0) return text

  const fileReferences = files
    .map((file) => `- ${file.path}${file.type ? ` (${file.type})` : ''}`)
    .join('\n')
  const intro = text.trim().length > 0 ? text.trim() : 'Use the selected files as context.'

  return `${intro}\n\nSelected file context paths:\n${fileReferences}\n\nRead these files if you need their contents.`
}
