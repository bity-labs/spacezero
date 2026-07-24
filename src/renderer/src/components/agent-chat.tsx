import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  ChatInput,
  ChatTranscript,
  type AiChatMessage,
  type AiChatThinkingLevel,
  type ChatInputAgentDefinition,
  type ChatInputModel
} from '@renderer/components/ai-chat'
import { cn } from '@renderer/lib/utils'
import type { AgentDefinitionReference, AgentSessionState } from '@shared/agent-protocol'
import type { AvailableModel, ModelDefaults } from '@shared/model-settings'

export type AgentChatMessage = AiChatMessage

export type AgentChatProps = {
  sessionId: string
  messages: AgentChatMessage[]
  sessionState?: AgentSessionState
  status?: 'idle' | 'running'
  placeholder?: string
  composer?: ReactNode
  emptyState?: ReactNode
  className?: string
  contentClassName?: string
  onSubmit?: (
    text: string,
    options?: { agentDefinition?: AgentDefinitionReference }
  ) => void | Promise<void>
  onAbort?: () => void
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
}

export function AgentChat({
  sessionId,
  messages,
  sessionState,
  status = 'idle',
  placeholder,
  composer,
  emptyState,
  className,
  contentClassName,
  onSubmit,
  onAbort,
  onToolConfirmationResolve
}: AgentChatProps) {
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

  const modelControls = useAgentChatModelControls(sessionId, sessionState)
  const definitionControls = useAgentDefinitionControls(sessionId, messages, sessionState)
  const defaultComposer = (
    <ChatInput
      models={modelControls.models}
      skills={sessionState?.skills}
      agentDefinitions={definitionControls.definitions}
      selectedAgentDefinitionId={definitionControls.selectedDefinitionId}
      activeAgentDefinition={sessionState?.agentDefinition}
      agentDefinitionLocked={definitionControls.locked}
      onAgentDefinitionChange={definitionControls.setSelectedDefinitionId}
      onAgentDefinitionPickerOpen={definitionControls.refreshDefinitions}
      selectedModelId={modelControls.selectedModelId}
      thinkingLevel={modelControls.thinkingLevel}
      onModelChange={modelControls.setModel}
      onThinkingChange={modelControls.setThinkingLevel}
      onSubmit={async ({ text, agentDefinitionId }) => {
        await onSubmit?.(
          text,
          agentDefinitionId ? { agentDefinition: { id: agentDefinitionId } } : undefined
        )
      }}
      onAbort={onAbort}
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
      {modelControls.error || definitionControls.error ? (
        <div
          className="absolute inset-x-6 top-3 z-20 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {modelControls.error ?? definitionControls.error}
        </div>
      ) : null}
      <ChatTranscript
        messages={messages}
        emptyState={emptyState}
        contentClassName={contentClassName}
        onToolConfirmationResolve={onToolConfirmationResolve}
      />
      {composerContent ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-6 pb-6 pt-16">
          <div className="pointer-events-auto w-full">{composerContent}</div>
        </div>
      ) : null}
    </section>
  )
}

function useAgentDefinitionControls(
  sessionId: string,
  messages: AgentChatMessage[],
  sessionState?: AgentSessionState
) {
  const [definitions, setDefinitions] = useState<ChatInputAgentDefinition[]>([])
  const [selectedDefinition, setSelectedDefinition] = useState<
    { sessionId: string; value: string | undefined } | undefined
  >(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const refreshDefinitions = useCallback(() => {
    void window.spacezero.agents
      .getGlobalDefinitions()
      .then((catalog) => {
        setDefinitions(
          catalog.flatMap((entry) => {
            if (entry.status !== 'valid' || entry.shadowedBy || !entry.name || !entry.description) {
              return []
            }

            return [
              {
                id: entry.id,
                name: entry.name,
                description: entry.description,
                scope: entry.scope
              }
            ]
          })
        )
        setError(undefined)
      })
      .catch((error: unknown) => {
        console.error('Failed to load Agent Definitions', error)
        setDefinitions([])
        setError('Unable to load Agent Definitions.')
      })
  }, [])

  useEffect(() => {
    refreshDefinitions()
  }, [refreshDefinitions])

  const locked = Boolean(sessionState?.agentDefinition) || messages.length > 0
  const selectedDefinitionId =
    selectedDefinition?.sessionId === sessionId && !locked ? selectedDefinition.value : undefined

  return {
    definitions,
    selectedDefinitionId,
    locked,
    error,
    refreshDefinitions,
    setSelectedDefinitionId: (definitionId: string | undefined) => {
      setSelectedDefinition({ sessionId, value: definitionId })
    }
  }
}

function useAgentChatModelControls(sessionId: string, sessionState?: AgentSessionState) {
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [modelDefaults, setModelDefaults] = useState<ModelDefaults | undefined>(undefined)
  const [localSessionState, setLocalSessionState] = useState<
    | {
        sourceSessionState: AgentSessionState | undefined
        value: AgentSessionState
      }
    | undefined
  >()
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      window.spacezero.agent.getAvailableModels(),
      window.spacezero.settings.getModelDefaults()
    ])
      .then(([models, defaults]) => {
        if (!cancelled) {
          setAvailableModels(models)
          setModelDefaults(defaults)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load agent model controls', error)
        if (!cancelled) {
          setAvailableModels([])
          setModelDefaults(undefined)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const localSessionStateIsCurrent =
    localSessionState?.value.sessionId === sessionId &&
    localSessionState.sourceSessionState === sessionState
  const effectiveSessionState = localSessionStateIsCurrent ? localSessionState.value : sessionState
  const models = useMemo(() => availableModels.map(toChatInputModel), [availableModels])
  const sessionModelId =
    effectiveSessionState?.modelProvider && effectiveSessionState.modelId
      ? encodeModelId(effectiveSessionState.modelProvider, effectiveSessionState.modelId)
      : undefined
  const defaultModelId = modelDefaults?.defaultModel
    ? encodeModelId(modelDefaults.defaultModel.providerId, modelDefaults.defaultModel.modelId)
    : undefined
  const selectedModelId = sessionModelId ?? defaultModelId
  const thinkingLevel = (effectiveSessionState?.thinkingLevel ??
    modelDefaults?.defaultThinking ??
    'medium') as AiChatThinkingLevel

  async function setModel(encodedModelId: string): Promise<void> {
    const model = decodeModelId(encodedModelId)
    if (!model) return

    const nextSessionState = await window.spacezero.agent.setModel({
      sessionId,
      provider: model.provider,
      modelId: model.modelId
    })
    setLocalSessionState({ sourceSessionState: sessionState, value: nextSessionState })
    setError(undefined)
  }

  async function setThinkingLevel(level: AiChatThinkingLevel): Promise<void> {
    const nextSessionState = await window.spacezero.agent.setThinkingLevel({ sessionId, level })
    setLocalSessionState({ sourceSessionState: sessionState, value: nextSessionState })
    setError(undefined)
  }

  return {
    models,
    selectedModelId,
    thinkingLevel,
    error,
    setModel: (modelId: string) => {
      void setModel(modelId).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Failed to update agent session model', error)
        setError(`Unable to change model: ${message}`)
      })
    },
    setThinkingLevel: (level: AiChatThinkingLevel) => {
      void setThinkingLevel(level).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Failed to update agent thinking level', error)
        setError(`Unable to change thinking level: ${message}`)
      })
    }
  }
}

function toChatInputModel(model: AvailableModel): ChatInputModel {
  return {
    id: encodeModelId(model.providerId, model.modelId),
    label: model.modelLabel,
    provider: model.providerId
  }
}

function encodeModelId(provider: string, modelId: string): string {
  return `${provider}:${modelId}`
}

function decodeModelId(encodedModelId: string): { provider: string; modelId: string } | undefined {
  const separatorIndex = encodedModelId.indexOf(':')
  if (separatorIndex <= 0) return undefined

  return {
    provider: encodedModelId.slice(0, separatorIndex),
    modelId: encodedModelId.slice(separatorIndex + 1)
  }
}
