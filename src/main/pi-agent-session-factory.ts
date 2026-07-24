import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  parseSkillBlock,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceDiagnostic,
  type ToolDefinition
} from '@earendil-works/pi-coding-agent'
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux'

import type {
  AgentStreamingEvent,
  CreateAgentSessionRequest,
  DelegationAgentDefinition
} from '../shared/agent-protocol'
import type {
  AuthProviderOption,
  AuthProviderStatus,
  AuthTestResult,
  ModelAuthSettings
} from '../shared/model-auth'
import type { AvailableModel, ThinkingLevel } from '../shared/model-settings'
import type {
  AgentAssistantContent,
  AgentToolResultContent,
  AgentTranscriptMessage,
  AgentUserContent
} from '../shared/agent-session-projection.model'
import type {
  AgentSkillDescriptor,
  AgentSkillDiscovery,
  AgentSkillPath
} from '../features/agent-workspace/shared/agent-skill.model'
import type { WorkspaceToolResult } from '../features/agent-workspace/shared/workspace-tool.model'
import { stripKnowledgeBaseMentionContext } from '../features/knowledge-base/shared'
import type {
  ExecuteWorkspaceToolRequest,
  WorkspaceToolAgentDescriptor
} from '../shared/workspace-tool-protocol'
import type { CreatedPiAgentSession } from './agent-session-registry'

const FAUX_PROVIDER_ID = 'faux'
const FAUX_MODEL_ID = 'faux-1'
const PI_SKILL_BLOCK_PREFIX = '<skill name="'
const PROJECT_TOOL_NAMES = ['bash', 'edit', 'write', 'read', 'grep', 'find', 'ls']
const DELEGATION_TOOL_NAME = 'agents.delegate'
const DELEGATION_TOOL_DESCRIPTION = [
  'Delegate a focused, self-contained task to the most specific visible Agent Definition.',
  'Choose the definition whose description best matches the work.',
  'The task must include all context the child needs because delegated agents start with a fresh conversation.'
].join(' ')
const DELEGATION_CATALOG_PROMPT_PREFIX = 'Available Agent Definitions for agents.delegate:'

export type PiAgentSessionFactoryOptions = {
  agentDir: string
  executeWorkspaceTool?: (request: ExecuteWorkspaceToolRequest) => Promise<WorkspaceToolResult>
  onSkillDiagnostics?: (diagnostics: ResourceDiagnostic[]) => void
  configureFauxProvider?: (provider: ReturnType<typeof fauxProvider>) => void
}

export type PiAgentRuntime = {
  createSession: (request: CreateAgentSessionRequest) => Promise<CreatedPiAgentSession>
  addApiKey: (providerId: string, apiKey: string) => Promise<void>
  removeApiKey: (providerId: string) => Promise<void>
  getAuthStatus: () => Promise<ModelAuthSettings>
  getAvailableModels: () => Promise<AvailableModel[]>
  listSkills: (skillPaths: AgentSkillPath[]) => Promise<AgentSkillDiscovery[]>
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
  executeWorkspaceTool,
  onSkillDiagnostics = logAgentSkillDiagnostics,
  configureFauxProvider
}: PiAgentSessionFactoryOptions): PiAgentRuntime {
  mkdirSync(agentDir, { recursive: true })
  mkdirSync(join(agentDir, 'sessions'), { recursive: true })

  const authStorage = AuthStorage.create(join(agentDir, 'auth.json'))
  const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, 'models.json'))
  const faux = fauxProvider({
    provider: FAUX_PROVIDER_ID,
    models: [{ id: FAUX_MODEL_ID, name: 'Faux Model' }]
  })
  configureFauxProvider?.(faux)

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

  async function createSession(request: CreateAgentSessionRequest): Promise<CreatedPiAgentSession> {
    const settingsManager = SettingsManager.inMemory()
    const appendSystemPrompt = [
      ...(request.appendSystemPrompt ?? []),
      ...((request.delegationDefinitions?.length ?? 0) > 0
        ? [createDelegationCatalogPrompt(request.delegationDefinitions ?? [])]
        : []),
      ...(request.agentDefinition ? [request.agentDefinition.body] : [])
    ]
    const disabledGlobalSkillPaths = new Set(
      (request.disabledGlobalSkillPaths ?? []).map((path) => resolve(path))
    )
    const resourceLoader = new DefaultResourceLoader({
      cwd: request.cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      additionalSkillPaths: (request.skillPaths ?? [])
        .map((entry) => entry.path)
        .filter((path) => existsSync(path)),
      skillsOverride: ({ skills, diagnostics }) => ({
        skills: skills.filter((skill) => !disabledGlobalSkillPaths.has(resolve(skill.filePath))),
        diagnostics
      }),
      ...(request.systemPromptContext
        ? {
            systemPromptOverride: (base: string | undefined) =>
              [base, request.systemPromptContext].filter(Boolean).join('\n\n')
          }
        : {}),
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      appendSystemPrompt
    })
    await resourceLoader.reload()
    reportSkillDiagnostics(resourceLoader.getSkills().diagnostics, onSkillDiagnostics)

    const sessionsDir = join(agentDir, 'sessions')
    const sessionManager = request.transcriptPath
      ? SessionManager.open(request.transcriptPath, sessionsDir, request.cwd)
      : SessionManager.create(request.cwd, sessionsDir, {
          id: request.sessionId,
          ...(request.parentSessionId ? { parentSession: request.parentSessionId } : {})
        })
    if (request.parentSessionId) {
      sessionManager.appendCustomEntry('spacezero.subagentRun', {
        parentSessionId: request.parentSessionId,
        childSessionId: request.sessionId
      })
    }
    const activeDelegations = createActiveDelegations()
    const workspaceToolProxies = createWorkspaceToolProxies({
      sessionId: request.sessionId,
      parentSessionId: request.parentSessionId,
      descriptors: request.workspaceTools ?? [],
      executeWorkspaceTool
    })
    const delegationTools = createDelegationTools({
      parentRequest: request,
      definitions: request.delegationDefinitions ?? [],
      activeDelegations,
      createSession
    })
    const customTools = [...workspaceToolProxies, ...delegationTools]
    const toolNames = selectToolNames({
      kind: request.kind,
      workspaceTools: request.workspaceTools ?? [],
      workspaceToolProxies,
      delegationTools,
      allowedTools: request.agentDefinition?.tools
    })
    const model = request.agentDefinition?.model ?? request.defaultModel
    const thinkingLevel = request.agentDefinition?.thinkingLevel ?? request.thinkingLevel

    const { session } = await createAgentSession({
      cwd: request.cwd,
      agentDir,
      model: model
        ? findConfiguredModel(modelRegistry, model.providerId, model.modelId)
        : (findInitialModel(modelRegistry) ??
          modelRegistry.find(FAUX_PROVIDER_ID, FAUX_MODEL_ID) ??
          faux.getModel()),
      thinkingLevel,
      tools: toolNames,
      customTools,
      sessionManager,
      authStorage,
      modelRegistry,
      settingsManager,
      resourceLoader
    })

    return adaptAgentSession({
      session,
      modelRegistry,
      initialThinkingLevel: thinkingLevel,
      skillPaths: request.skillPaths,
      agentDefinition: request.agentDefinition,
      toolNames,
      activeDelegations
    })
  }

  return {
    createSession,
    addApiKey: async (providerId, apiKey) => {
      assertKnownApiKeyProvider(modelRegistry, authStorage, providerId)
      const trimmedApiKey = apiKey.trim()
      if (!trimmedApiKey) throw new Error('agent.emptyApiKey')

      authStorage.set(providerId, { type: 'api_key', key: trimmedApiKey })
      modelRegistry.refresh()
    },
    removeApiKey: async (providerId) => {
      assertKnownApiKeyProvider(modelRegistry, authStorage, providerId)
      authStorage.remove(providerId)
      authStorage.removeRuntimeApiKey(providerId)
      modelRegistry.refresh()
    },
    getAuthStatus: async () => getModelAuthSettingsFromRegistry(modelRegistry, authStorage),
    getAvailableModels: async () => getAvailableModelsFromRegistry(modelRegistry),
    listSkills: async (skillPaths) => {
      const settingsManager = SettingsManager.inMemory()
      const resourceLoader = new DefaultResourceLoader({
        cwd: process.cwd(),
        agentDir,
        settingsManager,
        noExtensions: true,
        noSkills: true,
        additionalSkillPaths: skillPaths
          .map((entry) => entry.path)
          .filter((path) => existsSync(path)),
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true
      })
      await resourceLoader.reload()
      const skillResources = resourceLoader.getSkills()
      reportSkillDiagnostics(skillResources.diagnostics, onSkillDiagnostics)
      return toAgentSkillDiscoveries(skillResources.skills, skillPaths)
    },
    testAuth: async (providerId) => testProviderAuth(modelRegistry, authStorage, providerId),
    loginOAuth: async (providerId, callbacks) => {
      assertKnownOAuthProvider(authStorage, providerId)
      await authStorage.login(providerId, {
        onAuth: ({ url }) => void callbacks.openExternal(url),
        onDeviceCode: ({ verificationUri }) => void callbacks.openExternal(verificationUri),
        onPrompt: async () => callbacks.waitForCallback(providerId),
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
    .find(
      (availableModel) => availableModel.provider === providerId && availableModel.id === modelId
    )

  if (!model) throw new Error('agent.modelAuthNotConfigured')
  return model
}

function getModelAuthSettingsFromRegistry(
  modelRegistry: ModelRegistry,
  authStorage: AuthStorage
): ModelAuthSettings {
  const subscriptionProviders = getSubscriptionProviderOptions(authStorage)
  const apiKeyProviders = getApiKeyProviderOptions(modelRegistry, authStorage)

  return {
    subscriptions: {
      connected: subscriptionProviders.flatMap((provider) => {
        const status = authStorage.getAuthStatus(provider.providerId)
        if (!status.configured) return []

        return [
          {
            providerId: provider.providerId,
            label: provider.label,
            configured: true,
            source: status.source,
            displayLabel: getSubscriptionAuthStatusDisplayLabel(status.source),
            removable: status.source === 'stored'
          } satisfies AuthProviderStatus
        ]
      }),
      availableProviders: subscriptionProviders
    },
    apiKeys: {
      configured: apiKeyProviders.flatMap((provider) => {
        const status = modelRegistry.getProviderAuthStatus(provider.providerId)
        if (!status.configured) return []
        if (status.source === 'stored' && authStorage.get(provider.providerId)?.type !== 'api_key')
          return []

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
  return authStorage
    .getOAuthProviders()
    .filter(isSupportedOAuthProvider)
    .map((provider) => {
      const metadata = provider as { id: string; name: string; description?: string }

      return {
        providerId: metadata.id,
        label: metadata.name,
        description: metadata.description
      }
    })
}

function getApiKeyProviderOptions(
  modelRegistry: ModelRegistry,
  _authStorage: AuthStorage
): AuthProviderOption[] {
  const providerIds = new Set(
    modelRegistry
      .getAll()
      .filter((model) => model.provider !== FAUX_PROVIDER_ID)
      .map((model) => model.provider)
  )

  return [...providerIds]
    .sort((left, right) =>
      modelRegistry
        .getProviderDisplayName(left)
        .localeCompare(modelRegistry.getProviderDisplayName(right))
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
  authStorage: AuthStorage,
  providerId: string
): Promise<AuthTestResult> {
  assertKnownApiKeyProvider(modelRegistry, authStorage, providerId)
  const status = modelRegistry.getProviderAuthStatus(providerId)
  if (!status.configured) return { ok: false, message: 'agent.authNotConfigured' }

  const apiKey = await modelRegistry.getApiKeyForProvider(providerId)
  return apiKey ? { ok: true } : { ok: false, message: 'agent.authUnavailable' }
}

function getSubscriptionAuthStatusDisplayLabel(
  source: AuthProviderStatus['source']
): string | undefined {
  if (source === 'stored') return undefined
  return getAuthStatusDisplayLabel(source)
}

function getAuthStatusDisplayLabel(source: AuthProviderStatus['source']): string | undefined {
  if (source === 'environment') return 'Configured from environment'
  if (source === 'stored') return 'Stored API key'
  if (source === 'runtime') return 'Configured for this run'
  if (source === 'models_json_key' || source === 'models_json_command')
    return 'Configured from models.json'
  if (source === 'fallback') return 'Configured from provider fallback'
  return undefined
}

function assertKnownApiKeyProvider(
  modelRegistry: ModelRegistry,
  _authStorage: AuthStorage,
  providerId: string
): void {
  const isKnownApiKeyProvider = modelRegistry
    .getAll()
    .some((model) => model.provider === providerId && model.provider !== FAUX_PROVIDER_ID)

  if (!isKnownApiKeyProvider) throw new Error('agent.unknownApiKeyProvider')
}

function assertKnownOAuthProvider(authStorage: AuthStorage, providerId: string): void {
  if (
    !authStorage
      .getOAuthProviders()
      .some((provider) => provider.id === providerId && isSupportedOAuthProvider(provider))
  ) {
    throw new Error('agent.unknownOAuthProvider')
  }
}

function isSupportedOAuthProvider(provider: { usesCallbackServer?: boolean }): boolean {
  return provider.usesCallbackServer === true
}

function createWorkspaceToolProxies({
  sessionId,
  parentSessionId,
  descriptors,
  executeWorkspaceTool
}: {
  sessionId: string
  parentSessionId: string | undefined
  descriptors: WorkspaceToolAgentDescriptor[]
  executeWorkspaceTool: PiAgentSessionFactoryOptions['executeWorkspaceTool']
}): ToolDefinition[] {
  return descriptors.map((descriptor, index) =>
    defineTool({
      name: toPiToolName(descriptor.name, index),
      label: descriptor.name,
      description: descriptor.description,
      parameters: descriptor.parameters as ToolDefinition['parameters'],
      execute: async (callId, input) => {
        const result = executeWorkspaceTool
          ? await executeWorkspaceTool({
              sessionId,
              parentSessionId,
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

function selectToolNames({
  kind,
  workspaceTools,
  workspaceToolProxies,
  delegationTools,
  allowedTools
}: {
  kind: CreateAgentSessionRequest['kind']
  workspaceTools: WorkspaceToolAgentDescriptor[]
  workspaceToolProxies: ToolDefinition[]
  delegationTools: ToolDefinition[]
  allowedTools: string[] | undefined
}): string[] {
  const projectTools = kind === 'workspace' ? [] : PROJECT_TOOL_NAMES
  const workspaceToolNames = workspaceTools.map((descriptor, index) => ({
    originalName: descriptor.name,
    piName: workspaceToolProxies[index]?.name
  }))
  const delegationToolNames = delegationTools.map((tool) => tool.name)

  if (!allowedTools) {
    return [
      ...projectTools,
      ...workspaceToolNames.flatMap((tool) => (tool.piName ? [tool.piName] : [])),
      ...delegationToolNames
    ]
  }

  const allowed = new Set(allowedTools)
  const selectedTools = [
    ...projectTools.filter((toolName) => allowed.has(toolName)),
    ...workspaceToolNames.flatMap((tool) =>
      tool.piName && allowed.has(tool.originalName) ? [tool.piName] : []
    ),
    ...delegationToolNames
  ]

  if (selectedTools.length === 0) throw new Error('agentDefinition.emptyToolAllowlist')
  return selectedTools
}

type DelegationStatus = 'completed' | 'error' | 'aborted'

type DelegationResult = {
  status: DelegationStatus
  output: string
  childSessionId?: string
  transcriptPath?: string
  parentSessionId: string
}

type ActiveDelegations = {
  readonly cascadeReason: 'aborted' | undefined
  register: (childSessionId: string, childSession: CreatedPiAgentSession) => void
  unregister: (childSessionId: string) => void
  abortAll: () => void
  abortAndDisposeAll: () => void
}

function createActiveDelegations(): ActiveDelegations {
  const children = new Map<string, CreatedPiAgentSession>()
  let cascadeReason: 'aborted' | undefined

  function abortChild(childSession: CreatedPiAgentSession): void {
    void childSession.abort().catch(() => undefined)
  }

  return {
    get cascadeReason() {
      return cascadeReason
    },
    register: (childSessionId, childSession) => {
      if (cascadeReason) {
        abortChild(childSession)
        return
      }
      children.set(childSessionId, childSession)
    },
    unregister: (childSessionId) => {
      children.delete(childSessionId)
      if (children.size === 0) cascadeReason = undefined
    },
    abortAll: () => {
      if (children.size === 0) return
      cascadeReason = 'aborted'
      for (const childSession of children.values()) {
        abortChild(childSession)
      }
    },
    abortAndDisposeAll: () => {
      cascadeReason = 'aborted'
      for (const childSession of children.values()) {
        abortChild(childSession)
        childSession.dispose()
      }
      children.clear()
    }
  }
}

function createDelegationTools({
  parentRequest,
  definitions,
  activeDelegations,
  createSession
}: {
  parentRequest: CreateAgentSessionRequest
  definitions: DelegationAgentDefinition[]
  activeDelegations: ActiveDelegations
  createSession: (request: CreateAgentSessionRequest) => Promise<CreatedPiAgentSession>
}): ToolDefinition[] {
  if (definitions.length === 0) return []

  return [
    defineTool({
      name: toPiToolName(DELEGATION_TOOL_NAME),
      label: DELEGATION_TOOL_NAME,
      description: DELEGATION_TOOL_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          definition: {
            type: 'string',
            description: 'The id of the visible Agent Definition to run.'
          },
          task: {
            type: 'string',
            description: 'A self-contained task for the delegated child agent.'
          }
        },
        required: ['definition', 'task'],
        additionalProperties: false
      },
      execute: async (_callId, input) => {
        const result = await runDelegatedAgent({
          parentRequest,
          definitions,
          activeDelegations,
          input,
          createSession
        })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ status: result.status, output: result.output })
            }
          ],
          isError: result.status === 'error',
          details: result
        }
      }
    } as ToolDefinition)
  ]
}

async function runDelegatedAgent({
  parentRequest,
  definitions,
  activeDelegations,
  input,
  createSession
}: {
  parentRequest: CreateAgentSessionRequest
  definitions: DelegationAgentDefinition[]
  activeDelegations: ActiveDelegations
  input: unknown
  createSession: (request: CreateAgentSessionRequest) => Promise<CreatedPiAgentSession>
}): Promise<DelegationResult> {
  const parsedInput = parseDelegationInput(input)
  if (!parsedInput.ok) {
    return createDelegationError(parentRequest.sessionId, parsedInput.error)
  }

  const definition = definitions.find((entry) => entry.id === parsedInput.definition)
  if (!definition) {
    return createDelegationError(
      parentRequest.sessionId,
      `Unknown Agent Definition: ${parsedInput.definition}`
    )
  }
  if (definition.resolutionError) {
    return createDelegationError(
      parentRequest.sessionId,
      `Agent Definition ${definition.id} cannot be delegated: ${definition.resolutionError}`
    )
  }

  const childSessionId = `subagent-${randomUUID()}`
  let childSession: CreatedPiAgentSession | undefined

  try {
    childSession = await createSession({
      sessionId: childSessionId,
      kind: parentRequest.kind,
      projectId: parentRequest.kind === 'workspace' ? null : parentRequest.projectId,
      cwd: parentRequest.cwd,
      workspaceTools: parentRequest.workspaceTools,
      skillPaths: parentRequest.skillPaths,
      disabledGlobalSkillPaths: parentRequest.disabledGlobalSkillPaths,
      defaultModel: parentRequest.defaultModel,
      thinkingLevel: parentRequest.thinkingLevel,
      parentSessionId: parentRequest.sessionId,
      agentDefinition: {
        id: definition.id,
        name: definition.name,
        body: createSubagentSystemPrompt(definition),
        ...(definition.model ? { model: definition.model } : {}),
        ...(definition.thinkingLevel ? { thinkingLevel: definition.thinkingLevel } : {}),
        ...(definition.tools ? { tools: definition.tools } : {})
      }
    })
    activeDelegations.register(childSessionId, childSession)
    if (activeDelegations.cascadeReason) {
      return createDelegationAborted(
        parentRequest.sessionId,
        childSessionId,
        childSession.sessionFile
      )
    }

    await childSession.prompt(parsedInput.task)

    if (activeDelegations.cascadeReason) {
      return createDelegationAborted(
        parentRequest.sessionId,
        childSessionId,
        childSession.sessionFile
      )
    }

    const finalAssistantResult = getFinalAssistantResult(childSession.getTranscriptSnapshot())
    return {
      status: finalAssistantResult.status,
      output: finalAssistantResult.output,
      childSessionId,
      transcriptPath: childSession.sessionFile,
      parentSessionId: parentRequest.sessionId
    }
  } catch (error) {
    if (activeDelegations.cascadeReason) {
      return createDelegationAborted(
        parentRequest.sessionId,
        childSessionId,
        childSession?.sessionFile
      )
    }
    return {
      status: 'error',
      output: error instanceof Error ? error.message : String(error),
      ...(childSession ? { childSessionId, transcriptPath: childSession.sessionFile } : {}),
      parentSessionId: parentRequest.sessionId
    }
  } finally {
    activeDelegations.unregister(childSessionId)
    childSession?.dispose()
  }
}

function parseDelegationInput(
  input: unknown
): { ok: true; definition: string; task: string } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'agents.delegate input must be an object.' }

  const definition = typeof input.definition === 'string' ? input.definition.trim() : ''
  const task = typeof input.task === 'string' ? input.task.trim() : ''
  if (!definition) return { ok: false, error: 'agents.delegate definition is required.' }
  if (!task) return { ok: false, error: 'agents.delegate task is required.' }
  return { ok: true, definition, task }
}

function createDelegationError(parentSessionId: string, output: string): DelegationResult {
  return { status: 'error', output, parentSessionId }
}

function createDelegationAborted(
  parentSessionId: string,
  childSessionId: string,
  transcriptPath: string | undefined
): DelegationResult {
  return {
    status: 'aborted',
    output: '',
    childSessionId,
    ...(transcriptPath ? { transcriptPath } : {}),
    parentSessionId
  }
}

function createDelegationCatalogPrompt(definitions: DelegationAgentDefinition[]): string {
  return [
    DELEGATION_CATALOG_PROMPT_PREFIX,
    ...definitions.map(
      (definition) => `- ${definition.id}: ${definition.name} — ${definition.description}`
    ),
    '',
    [
      'Use agents.delegate only for focused work that benefits from a fresh specialist context.',
      'Pick the most specific definition and provide a self-contained task.'
    ].join(' ')
  ].join('\n')
}

function createSubagentSystemPrompt(definition: DelegationAgentDefinition): string {
  return [
    'You are a delegated Space Zero subagent run.',
    'You start with a fresh conversation and do not have the parent transcript.',
    'Complete only the delegated task. Report your result in your final assistant message.',
    '',
    `Agent Definition: ${definition.name} (${definition.id})`,
    definition.body
  ].join('\n')
}

function isAssistantTranscriptMessage(
  message: AgentTranscriptMessage
): message is Extract<AgentTranscriptMessage, { role: 'assistant' }> {
  return message.role === 'assistant' && Array.isArray(message.content)
}

function getFinalAssistantResult(transcript: AgentTranscriptMessage[]): {
  status: Exclude<DelegationStatus, 'aborted'>
  output: string
} {
  const finalAssistant = [...transcript].reverse().find(isAssistantTranscriptMessage)
  if (!finalAssistant || !('content' in finalAssistant) || !Array.isArray(finalAssistant.content)) {
    return { status: 'completed', output: '' }
  }

  const output = finalAssistant.content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('')
  if (finalAssistant.stopReason === 'error') {
    return {
      status: 'error',
      output: finalAssistant.errorMessage || output || 'Agent stopped with an error.'
    }
  }

  return { status: 'completed', output }
}

/** Pi providers accept only alphanumeric, underscore, and dash tool names. */
export function toPiToolName(name: string, index = 0): string {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const withFallback = safeName || 'workspace_tool'
  const suffix = `_${index}`
  return `${withFallback.slice(0, 64 - suffix.length)}${suffix}`
}

function adaptAgentSession({
  session,
  modelRegistry,
  initialThinkingLevel,
  skillPaths,
  agentDefinition,
  toolNames,
  activeDelegations
}: {
  session: AgentSession
  modelRegistry: ModelRegistry
  initialThinkingLevel?: ThinkingLevel
  skillPaths?: AgentSkillPath[]
  agentDefinition?: CreateAgentSessionRequest['agentDefinition']
  toolNames: string[]
  activeDelegations: ActiveDelegations
}): CreatedPiAgentSession {
  let preferredThinkingLevel =
    initialThinkingLevel ?? (session.thinkingLevel as ThinkingLevel | undefined)

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
      return preferredThinkingLevel
    },
    get systemPrompt() {
      return session.systemPrompt
    },
    ...(agentDefinition
      ? { agentDefinition: { id: agentDefinition.id, name: agentDefinition.name } }
      : {}),
    toolNames,
    skills: toAgentSkillDescriptors(session.resourceLoader.getSkills().skills, skillPaths),
    setModel: async ({ provider, modelId }) => {
      await session.setModel(findConfiguredModel(modelRegistry, provider, modelId))
      if (preferredThinkingLevel) session.setThinkingLevel(preferredThinkingLevel)
    },
    setThinkingLevel: (level) => {
      preferredThinkingLevel = level
      session.setThinkingLevel(level)
    },
    prompt: (message) => session.prompt(message),
    abort: async () => {
      activeDelegations.abortAll()
      await session.abort()
    },
    subscribe: (listener) =>
      session.subscribe((event) => {
        const streamingEvent = toAgentStreamingEvent(session.sessionId, event)
        if (streamingEvent) listener(streamingEvent)
      }),
    dispose: () => {
      activeDelegations.abortAndDisposeAll()
      session.dispose()
    },
    getTranscriptSnapshot: () =>
      toTranscriptSnapshot(session.messages, session.state.streamingMessage)
  }
}

function toAgentSkillDescriptors(
  skills: Array<{
    name: string
    description: string
    filePath: string
    sourceInfo: { scope: string }
  }>,
  skillPaths: AgentSkillPath[] | undefined
): AgentSkillDescriptor[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    scope: resolveSkillScope(skill.filePath, skillPaths, skill.sourceInfo.scope)
  }))
}

function toAgentSkillDiscoveries(
  skills: Array<{
    name: string
    description: string
    filePath: string
    sourceInfo: { scope: string }
  }>,
  skillPaths: AgentSkillPath[]
): AgentSkillDiscovery[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    scope: resolveSkillScope(skill.filePath, skillPaths, skill.sourceInfo.scope),
    path: resolve(skill.filePath)
  }))
}

function resolveSkillScope(
  filePath: string,
  skillPaths: AgentSkillPath[] | undefined,
  fallbackScope: string
): AgentSkillDescriptor['scope'] {
  const matchingPath = (skillPaths ?? [])
    .filter((entry) => isPathWithin(filePath, entry.path))
    .sort((left, right) => right.path.length - left.path.length)[0]

  if (matchingPath) return matchingPath.scope
  if (fallbackScope === 'project') return 'project'
  return 'user'
}

function isPathWithin(filePath: string, rootPath: string): boolean {
  const relativePath = relative(resolve(rootPath), resolve(filePath))
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  )
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

  return [
    { ...message, role: typeof message.role === 'string' ? message.role : 'unknown', timestamp }
  ]
}

function toUserContent(content: unknown): string | AgentUserContent[] {
  if (typeof content === 'string') return toDisplayUserText(content)
  if (!Array.isArray(content)) return []

  return content.flatMap((part): AgentUserContent[] => {
    if (!isRecord(part)) return []
    if (part.type === 'text' && typeof part.text === 'string') {
      return [{ type: 'text', text: toDisplayUserText(part.text) }]
    }
    if (
      part.type === 'image' &&
      typeof part.data === 'string' &&
      typeof part.mimeType === 'string'
    ) {
      return [{ type: 'image', data: part.data, mimeType: part.mimeType }]
    }
    return []
  })
}

function toDisplayUserText(text: string): string {
  const displayText = stripKnowledgeBaseMentionContext(text)
  const expandedSkill = parseSkillBlock(displayText)
  if (!expandedSkill) {
    return displayText.startsWith(PI_SKILL_BLOCK_PREFIX) ? '/skill' : displayText
  }

  const safeUserMessage = expandedSkill.userMessage?.includes('</skill>')
    ? undefined
    : expandedSkill.userMessage
  return `/skill:${expandedSkill.name}${safeUserMessage ? ` ${safeUserMessage}` : ''}`
}

function toToolResultContent(content: unknown): AgentToolResultContent[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []

  return content.flatMap((part): AgentToolResultContent[] => {
    if (!isRecord(part)) return []
    if (part.type === 'text' && typeof part.text === 'string') {
      return [{ type: 'text', text: part.text }]
    }
    if (
      part.type === 'image' &&
      typeof part.data === 'string' &&
      typeof part.mimeType === 'string'
    ) {
      return [{ type: 'image', data: part.data, mimeType: part.mimeType }]
    }
    return []
  })
}

function toAssistantContent(content: unknown): AgentAssistantContent[] {
  if (!Array.isArray(content)) return []

  return content.flatMap((part): AgentAssistantContent[] => {
    if (!isRecord(part)) return []
    if (part.type === 'text' && typeof part.text === 'string')
      return [{ type: 'text', text: part.text }]
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

function toAssistantStopReason(
  value: unknown
): 'stop' | 'length' | 'toolUse' | 'error' | 'aborted' | undefined {
  return value === 'stop' ||
    value === 'length' ||
    value === 'toolUse' ||
    value === 'error' ||
    value === 'aborted'
    ? value
    : undefined
}

function getTimestamp(message: Record<string, unknown>): number {
  if (typeof message.timestamp === 'number') return message.timestamp
  return Date.now()
}

function reportSkillDiagnostics(
  diagnostics: ResourceDiagnostic[],
  onSkillDiagnostics: (diagnostics: ResourceDiagnostic[]) => void
): void {
  if (diagnostics.length > 0) onSkillDiagnostics(diagnostics)
}

function logAgentSkillDiagnostics(diagnostics: ResourceDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    console.warn('[agent-skills] resource diagnostic', diagnostic)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function toAgentStreamingEvent(
  sessionId: string,
  event: { type: string; [key: string]: unknown }
): AgentStreamingEvent | undefined {
  if (
    event.type === 'agent_start' ||
    event.type === 'turn_start' ||
    event.type === 'turn_end' ||
    event.type === 'agent_end'
  ) {
    return { type: event.type, sessionId }
  }

  if (event.type === 'message_start' || event.type === 'message_end') {
    return {
      type: event.type,
      sessionId,
      messageId: getMessageId(event.message),
      message: toTranscriptMessage(event.message)[0]
    }
  }

  if (event.type === 'message_update') {
    const message = toTranscriptMessage(event.message)[0]
    const assistantMessageEvent = event.assistantMessageEvent as
      { type?: string; delta?: unknown } | undefined
    const delta =
      assistantMessageEvent?.type === 'text_delta' &&
      typeof assistantMessageEvent.delta === 'string'
        ? assistantMessageEvent.delta
        : undefined

    if (!message && delta === undefined) return undefined

    return {
      type: 'message_update',
      sessionId,
      messageId: getMessageId(event.message),
      ...(delta !== undefined ? { delta } : {}),
      ...(message ? { message } : {})
    }
  }

  return undefined
}

function getMessageId(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null || !('id' in message)) return undefined
  const id = (message as { id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}
