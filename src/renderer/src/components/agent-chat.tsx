import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { KNOWLEDGE_BASE_FILES_CONTEXT_KEY, type FilesEntry } from '../../../features/files/shared'
import {
  type AiChatMessage,
  type AiChatThinkingLevel,
  type ChatInputAgentDefinition,
  type ChatInputCommand,
  type ChatInputHistoryItem,
  type ChatInputModel
} from '@renderer/components/ai-chat'
import { AgentChatView } from '@renderer/components/agent-chat-view'
import type { AgentDefinitionReference, AgentSessionState } from '@shared/agent-protocol'
import type { AvailableModel, ModelDefaults } from '@shared/model-settings'

export type AgentChatMessage = AiChatMessage

export type AgentChatProps = {
  sessionId: string
  messages: AgentChatMessage[]
  sessionState?: AgentSessionState
  status?: 'idle' | 'running'
  placeholder?: string
  commands?: ChatInputCommand[]
  historyItems?: ChatInputHistoryItem[]
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
}

export function AgentChat({
  sessionId,
  messages,
  sessionState,
  status = 'idle',
  placeholder,
  commands,
  historyItems,
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
  onOpenLink
}: AgentChatProps) {
  const modelControls = useAgentChatModelControls(sessionId, sessionState)
  const definitionControls = useAgentDefinitionControls(sessionId, messages, sessionState)

  return (
    <AgentChatView
      sessionId={sessionId}
      messages={messages}
      status={status}
      error={modelControls.error ?? definitionControls.error}
      placeholder={placeholder}
      commands={commands}
      historyItems={historyItems}
      skills={sessionState?.skills}
      models={modelControls.models}
      selectedModelId={modelControls.selectedModelId}
      thinkingLevel={modelControls.thinkingLevel}
      agentDefinitions={definitionControls.definitions}
      selectedAgentDefinitionId={definitionControls.selectedDefinitionId}
      activeAgentDefinition={sessionState?.agentDefinition}
      agentDefinitionLocked={definitionControls.locked}
      composer={composer}
      emptyState={emptyState}
      className={className}
      contentClassName={contentClassName}
      onSubmit={onSubmit}
      onCommand={onCommand}
      onHistorySelect={onHistorySelect}
      onHistoryDismiss={onHistoryDismiss}
      onAbort={onAbort}
      onToolConfirmationResolve={onToolConfirmationResolve}
      onOpenLink={onOpenLink}
      onModelChange={modelControls.setModel}
      onThinkingChange={modelControls.setThinkingLevel}
      onAgentDefinitionChange={definitionControls.setSelectedDefinitionId}
      onAgentDefinitionPickerOpen={definitionControls.refreshDefinitions}
      resolveFilePath={window.spacezero.app.getSelectedFilePath}
      loadKnowledgeBaseMentionPaths={loadKnowledgeBaseMentionPaths}
    />
  )
}

async function loadKnowledgeBaseMentionPaths() {
  const status = await window.spacezero.knowledgeBase.getStatus()
  if (status.setupState !== 'configured') return { state: 'unconfigured' as const }

  return { state: 'ready' as const, paths: await listKnowledgeBaseMentionPaths() }
}

async function listKnowledgeBaseMentionPaths(relativePath = ''): Promise<string[]> {
  const entries = await window.spacezero.files.listDirectory({
    context: { kind: 'knowledge-base', contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY },
    relativePath
  })
  const paths = await Promise.all(entries.map(listKnowledgeBaseMentionEntry))
  return paths.flat()
}

async function listKnowledgeBaseMentionEntry(entry: FilesEntry): Promise<string[]> {
  if (entry.kind === 'symlink') return []
  if (entry.kind === 'file') return [entry.relativePath]
  return [`${entry.relativePath}/`, ...(await listKnowledgeBaseMentionPaths(entry.relativePath))]
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
      .getSessionDefinitions({ sessionId })
      .then((catalog) => {
        setDefinitions(
          catalog.flatMap((entry) => {
            const diagnostic = entry.diagnostics.find((item) => item.severity === 'error')
            if (entry.status !== 'valid') {
              return [
                {
                  id: entry.id,
                  name: entry.name ?? entry.id,
                  description: entry.description ?? 'Invalid Agent Definition.',
                  scope: entry.scope,
                  disabled: true,
                  unavailableReason: diagnostic?.message ?? 'Invalid Agent Definition.'
                }
              ]
            }
            if (!entry.name || !entry.description) return []

            return [
              {
                id: entry.id,
                name: entry.name,
                description: entry.description,
                scope: entry.scope,
                ...(entry.shadowedBy
                  ? {
                      disabled: true,
                      unavailableReason: `Shadowed by ${entry.shadowedBy} Agent Definition.`
                    }
                  : {})
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
  }, [sessionId])

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
    provider: model.providerId,
    supportedThinkingLevels: model.supportedThinkingLevels as AiChatThinkingLevel[] | undefined
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
