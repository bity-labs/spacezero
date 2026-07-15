import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  type AgentSession,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent'
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux'

import type { AgentStreamingEvent, CreateAgentSessionRequest } from '../shared/agent-protocol'
import type { AuthProviderOption, AuthProviderStatus, AuthTestResult, ModelAuthSettings } from '../shared/model-auth'
import type { AvailableModel, ThinkingLevel } from '../shared/model-settings'
import type {
  AgentAssistantContent,
  AgentToolResultContent,
  AgentTranscriptMessage,
  AgentUserContent
} from '../shared/agent-session-projection.model'
import type { WorkspaceToolResult } from '../features/agent-workspace/shared/workspace-tool.model'
import type {
  ExecuteWorkspaceToolRequest,
  WorkspaceToolAgentDescriptor
} from '../shared/workspace-tool-protocol'
import type { CreatedPiAgentSession } from './agent-session-registry'

const FAUX_PROVIDER_ID = 'faux'
const FAUX_MODEL_ID = 'faux-1'
const PROJECT_TOOL_NAMES = ['bash', 'edit', 'write', 'read', 'grep', 'find', 'ls']

export type PiAgentSessionFactoryOptions = {
  agentDir: string
  executeWorkspaceTool?: (request: ExecuteWorkspaceToolRequest) => Promise<WorkspaceToolResult>
}

export type PiAgentRuntime = {
  createSession: (request: CreateAgentSessionRequest) => Promise<CreatedPiAgentSession>
  addApiKey: (providerId: string, apiKey: string) => Promise<void>
  removeApiKey: (providerId: string) => Promise<void>
  getAuthStatus: () => Promise<ModelAuthSettings>
  getAvailableModels: () => Promise<AvailableModel[]>
  testAuth: (providerId: string) => Promise<AuthTestResult>
  loginOAuth: (providerId: string, callbacks: OAuthRuntimeCallbacks) => Promise<void>
  logoutOAuth: (providerId: string) => Promise<void>
}

type OAuthRuntimeCallbacks = {
  openExternal: (url: string) => Promise<void>
  waitForCallback: (providerId: string) => Promise<string>
}

export function createPiAgentRuntime({
  agentDir,
  executeWorkspaceTool
}: PiAgentSessionFactoryOptions): PiAgentRuntime {
  mkdirSync(agentDir, { recursive: true })
  mkdirSync(join(agentDir, 'sessions'), { recursive: true })

  const authStorage = AuthStorage.create(join(agentDir, 'auth.json'))
  const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, 'models.json'))
  const faux = fauxProvider({ provider: FAUX_PROVIDER_ID, models: [{ id: FAUX_MODEL_ID, name: 'Faux Model' }] })

  modelRegistry.registerProvider(FAUX_PROVIDER_ID, {
    name: 'Faux',
    api: faux.api,
    baseUrl: 'http://localhost:0',
    apiKey: 'faux',
    streamSimple: (model, context, options) => faux.provider.streamSimple(model, context, options),
    models: faux.models.map((model) => ({
      id: model.id,
      name: model.name,
      api: model.api,
      baseUrl: model.baseUrl,
      reasoning: model.reasoning,
      thinkingLevelMap: model.thinkingLevelMap,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      headers: model.headers,
      compat: model.compat
    }))
  })

  async function createSession(
    request: CreateAgentSessionRequest
  ): Promise<CreatedPiAgentSession> {
    const resourceLoader = new DefaultResourceLoader({
      cwd: request.cwd,
      agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true
    })

    const sessionsDir = join(agentDir, 'sessions')
    const sessionManager = request.transcriptPath
      ? SessionManager.open(request.transcriptPath, sessionsDir, request.cwd)
      : SessionManager.create(request.cwd, sessionsDir, { id: request.sessionId })
    const customTools = createWorkspaceToolProxies({
      sessionId: request.sessionId,
      descriptors: request.workspaceTools ?? [],
      executeWorkspaceTool
    })

    const { session } = await createAgentSession({
      cwd: request.cwd,
      model: request.defaultModel
        ? findConfiguredModel(modelRegistry, request.defaultModel.providerId, request.defaultModel.modelId)
        : findInitialModel(modelRegistry) ?? modelRegistry.find(FAUX_PROVIDER_ID, FAUX_MODEL_ID) ?? faux.getModel(),
      thinkingLevel: request.thinkingLevel,
      tools: [...PROJECT_TOOL_NAMES, ...customTools.map((tool) => tool.name)],
      customTools,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader
    })

    return adaptAgentSession(session, modelRegistry)
  }

  return {
    createSession,
    addApiKey: async (providerId, apiKey) => {
      assertKnownApiKeyProvider(modelRegistry, providerId)
      const trimmedApiKey = apiKey.trim()
      if (!trimmedApiKey) throw new Error('agent.emptyApiKey')

      authStorage.set(providerId, { type: 'api_key', key: trimmedApiKey })
      modelRegistry.refresh()
    },
    removeApiKey: async (providerId) => {
      assertKnownApiKeyProvider(modelRegistry, providerId)
      authStorage.remove(providerId)
      authStorage.removeRuntimeApiKey(providerId)
      modelRegistry.refresh()
    },
    getAuthStatus: async () => getModelAuthSettingsFromRegistry(modelRegistry, authStorage),
    getAvailableModels: async () => getAvailableModelsFromRegistry(modelRegistry),
    testAuth: async (providerId) => testProviderAuth(modelRegistry, providerId),
    loginOAuth: async (providerId, callbacks) => {
      assertKnownOAuthProvider(authStorage, providerId)
      await authStorage.login(providerId, {
        onAuth: ({ url }) => void callbacks.openExternal(url),
        onDeviceCode: ({ verificationUri }) => void callbacks.openExternal(verificationUri),
        onPrompt: async () => callbacks.waitForCallback(providerId),
        onManualCodeInput: async () => callbacks.waitForCallback(providerId),
        onSelect: async (prompt) => prompt.options[0]?.id,
        onProgress: () => undefined
      })
      modelRegistry.refresh()
    },
    logoutOAuth: async (providerId) => {
      assertKnownOAuthProvider(authStorage, providerId)
      authStorage.logout(providerId)
      modelRegistry.refresh()
    }
  }
}

export function createPiAgentSessionFactory(options: PiAgentSessionFactoryOptions) {
  return createPiAgentRuntime(options).createSession
}

function findInitialModel(modelRegistry: ModelRegistry) {
  return modelRegistry.getAvailable().find((model) => model.provider !== FAUX_PROVIDER_ID)
}

function findConfiguredModel(
  modelRegistry: ModelRegistry,
  providerId: string,
  modelId: string
): ReturnType<ModelRegistry['getAvailable']>[number] {
  const model = modelRegistry
    .getAvailable()
    .find((availableModel) => availableModel.provider === providerId && availableModel.id === modelId)

  if (!model) throw new Error('agent.modelAuthNotConfigured')
  return model
}

function getModelAuthSettingsFromRegistry(modelRegistry: ModelRegistry, authStorage: AuthStorage): ModelAuthSettings {
  const subscriptionProviders = getSubscriptionProviderOptions(authStorage)
  const apiKeyProviders = getApiKeyProviderOptions(modelRegistry)

  return {
    subscriptions: {
      connected: subscriptionProviders.flatMap((provider) => {
        const status = authStorage.getAuthStatus(provider.providerId)
        if (!status.configured) return []

        return [{
          providerId: provider.providerId,
          label: provider.label,
          configured: true,
          source: status.source,
          displayLabel: getAuthStatusDisplayLabel(status.source),
          removable: status.source === 'stored'
        } satisfies AuthProviderStatus]
      }),
      availableProviders: subscriptionProviders
    },
    apiKeys: {
      configured: apiKeyProviders.flatMap((provider) => {
        const status = modelRegistry.getProviderAuthStatus(provider.providerId)
        if (!status.configured) return []

        return [
          {
            providerId: provider.providerId,
            label: provider.label,
            configured: true,
            source: status.source,
            displayLabel: getAuthStatusDisplayLabel(status.source),
            removable: status.source === 'stored'
          } satisfies AuthProviderStatus
        ]
      }),
      availableProviders: apiKeyProviders
    }
  }
}

function getSubscriptionProviderOptions(authStorage: AuthStorage): AuthProviderOption[] {
  return authStorage.getOAuthProviders().map((provider) => ({
    providerId: provider.id,
    label: provider.name
  }))
}

function getApiKeyProviderOptions(modelRegistry: ModelRegistry): AuthProviderOption[] {
  const providerIds = new Set(
    modelRegistry
      .getAll()
      .filter((model) => model.provider !== FAUX_PROVIDER_ID)
      .map((model) => model.provider)
  )

  return [...providerIds]
    .sort((left, right) =>
      modelRegistry.getProviderDisplayName(left).localeCompare(modelRegistry.getProviderDisplayName(right))
    )
    .map((providerId) => ({
      providerId,
      label: modelRegistry.getProviderDisplayName(providerId)
    }))
}

function getAvailableModelsFromRegistry(modelRegistry: ModelRegistry): AvailableModel[] {
  return modelRegistry
    .getAvailable()
    .filter((model) => model.provider !== FAUX_PROVIDER_ID)
    .map((model) => ({
      providerId: model.provider,
      providerLabel: modelRegistry.getProviderDisplayName(model.provider),
      modelId: model.id,
      modelLabel: model.name,
      contextWindow: model.contextWindow,
      supportsThinking: model.reasoning
    }))
}

async function testProviderAuth(
  modelRegistry: ModelRegistry,
  providerId: string
): Promise<AuthTestResult> {
  assertKnownApiKeyProvider(modelRegistry, providerId)
  const status = modelRegistry.getProviderAuthStatus(providerId)
  if (!status.configured) return { ok: false, message: 'agent.authNotConfigured' }

  const apiKey = await modelRegistry.getApiKeyForProvider(providerId)
  return apiKey ? { ok: true } : { ok: false, message: 'agent.authUnavailable' }
}

function getAuthStatusDisplayLabel(source: AuthProviderStatus['source']): string | undefined {
  if (source === 'environment') return 'Configured from environment'
  if (source === 'stored') return 'Stored API key'
  if (source === 'runtime') return 'Configured for this run'
  if (source === 'models_json_key' || source === 'models_json_command') return 'Configured from models.json'
  if (source === 'fallback') return 'Configured from provider fallback'
  return undefined
}

function assertKnownApiKeyProvider(modelRegistry: ModelRegistry, providerId: string): void {
  if (!getApiKeyProviderOptions(modelRegistry).some((provider) => provider.providerId === providerId)) {
    throw new Error('agent.unknownApiKeyProvider')
  }
}

function assertKnownOAuthProvider(authStorage: AuthStorage, providerId: string): void {
  if (!authStorage.getOAuthProviders().some((provider) => provider.id === providerId)) {
    throw new Error('agent.unknownOAuthProvider')
  }
}

function createWorkspaceToolProxies({
  sessionId,
  descriptors,
  executeWorkspaceTool
}: {
  sessionId: string
  descriptors: WorkspaceToolAgentDescriptor[]
  executeWorkspaceTool: PiAgentSessionFactoryOptions['executeWorkspaceTool']
}): ToolDefinition[] {
  return descriptors.map((descriptor) =>
    defineTool({
      name: descriptor.name,
      label: descriptor.name,
      description: descriptor.description,
      parameters: descriptor.parameters as ToolDefinition['parameters'],
      execute: async (callId, input) => {
        const result = executeWorkspaceTool
          ? await executeWorkspaceTool({
              sessionId,
              callId,
              toolName: descriptor.name,
              input,
              safetyLevel: descriptor.safetyLevel
            })
          : {
              ok: false,
              error: {
                code: 'workspace-tool-unavailable',
                message: 'Workspace Tool executor unavailable'
              }
            }

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: !result.ok,
          details: result
        }
      }
    } as ToolDefinition)
  )
}

function adaptAgentSession(session: AgentSession, modelRegistry: ModelRegistry): CreatedPiAgentSession {
  return {
    sessionId: session.sessionId,
    sessionFile: session.sessionFile,
    get isStreaming() {
      return session.isStreaming
    },
    get modelProvider() {
      return session.model?.provider ?? FAUX_PROVIDER_ID
    },
    get modelId() {
      return session.model?.id ?? FAUX_MODEL_ID
    },
    get thinkingLevel() {
      return session.thinkingLevel as ThinkingLevel | undefined
    },
    setModel: async ({ provider, modelId }) => {
      await session.setModel(findConfiguredModel(modelRegistry, provider, modelId))
    },
    setThinkingLevel: (level) => session.setThinkingLevel(level),
    prompt: (message) => session.prompt(message),
    abort: () => session.abort(),
    subscribe: (listener) => session.subscribe((event) => {
      const streamingEvent = toStreamingEvent(session.sessionId, event)
      if (streamingEvent) listener(streamingEvent)
    }),
    dispose: () => session.dispose(),
    getTranscriptSnapshot: () => toTranscriptSnapshot(session.messages, session.state.streamingMessage)
  }
}

function toTranscriptSnapshot(
  messages: unknown[],
  streamingMessage: unknown | undefined
): AgentTranscriptMessage[] {
  const snapshot = messages.flatMap(toTranscriptMessage)
  if (streamingMessage) snapshot.push(...toTranscriptMessage(streamingMessage))
  return snapshot
}

function toTranscriptMessage(message: unknown): AgentTranscriptMessage[] {
  if (!isRecord(message)) return []
  const timestamp = getTimestamp(message)

  if (message.role === 'user') {
    return [{ role: 'user', content: toUserContent(message.content), timestamp }]
  }

  if (message.role === 'assistant') {
    return [
      {
        role: 'assistant',
        content: toAssistantContent(message.content),
        timestamp,
        stopReason: toAssistantStopReason(message.stopReason),
        errorMessage: typeof message.errorMessage === 'string' ? message.errorMessage : undefined
      }
    ]
  }

  if (message.role === 'toolResult') {
    return [
      {
        role: 'toolResult',
        toolCallId: typeof message.toolCallId === 'string' ? message.toolCallId : '',
        toolName: typeof message.toolName === 'string' ? message.toolName : '',
        content: toToolResultContent(message.content),
        isError: message.isError === true,
        details: message.details,
        timestamp
      }
    ]
  }

  return [{ ...message, role: typeof message.role === 'string' ? message.role : 'unknown', timestamp }]
}

function toUserContent(content: unknown): string | AgentUserContent[] {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return []

  return content.flatMap((part): AgentUserContent[] => {
    if (!isRecord(part)) return []
    if (part.type === 'text' && typeof part.text === 'string') return [{ type: 'text', text: part.text }]
    if (part.type === 'image' && typeof part.data === 'string' && typeof part.mimeType === 'string') {
      return [{ type: 'image', data: part.data, mimeType: part.mimeType }]
    }
    return []
  })
}

function toToolResultContent(content: unknown): AgentToolResultContent[] {
  const userContent = toUserContent(content)
  if (typeof userContent === 'string') return [{ type: 'text', text: userContent }]
  return userContent
}

function toAssistantContent(content: unknown): AgentAssistantContent[] {
  if (!Array.isArray(content)) return []

  return content.flatMap((part): AgentAssistantContent[] => {
    if (!isRecord(part)) return []
    if (part.type === 'text' && typeof part.text === 'string') return [{ type: 'text', text: part.text }]
    if (part.type === 'thinking' && typeof part.thinking === 'string') {
      return [{ type: 'thinking', thinking: part.thinking, redacted: part.redacted === true }]
    }
    if (part.type === 'toolCall' && typeof part.id === 'string' && typeof part.name === 'string') {
      return [
        {
          type: 'toolCall',
          id: part.id,
          name: part.name,
          arguments: isRecord(part.arguments) ? part.arguments : {}
        }
      ]
    }
    return []
  })
}

function toAssistantStopReason(value: unknown): 'stop' | 'length' | 'toolUse' | 'error' | 'aborted' | undefined {
  return value === 'stop' || value === 'length' || value === 'toolUse' || value === 'error' || value === 'aborted'
    ? value
    : undefined
}

function getTimestamp(message: Record<string, unknown>): number {
  if (typeof message.timestamp === 'number') return message.timestamp
  return Date.now()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStreamingEvent(sessionId: string, event: { type: string; [key: string]: unknown }): AgentStreamingEvent | undefined {
  if (event.type === 'agent_start' || event.type === 'turn_start' || event.type === 'turn_end' || event.type === 'agent_end') {
    return { type: event.type, sessionId }
  }

  if (event.type === 'message_start' || event.type === 'message_end') {
    return { type: event.type, sessionId, messageId: getMessageId(event.message) }
  }

  if (event.type === 'message_update') {
    const assistantMessageEvent = event.assistantMessageEvent as { type?: string; delta?: unknown } | undefined
    if (assistantMessageEvent?.type !== 'text_delta' || typeof assistantMessageEvent.delta !== 'string') {
      return undefined
    }

    return {
      type: 'message_update',
      sessionId,
      messageId: getMessageId(event.message),
      delta: assistantMessageEvent.delta
    }
  }

  return undefined
}

function getMessageId(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null || !('id' in message)) return undefined
  const id = (message as { id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}
