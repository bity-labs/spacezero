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

export function createPiAgentSessionFactory({
  agentDir,
  executeWorkspaceTool
}: PiAgentSessionFactoryOptions) {
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

  return async function createPiSession(
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
      model: modelRegistry.find(FAUX_PROVIDER_ID, FAUX_MODEL_ID) ?? faux.getModel(),
      tools: [...PROJECT_TOOL_NAMES, ...customTools.map((tool) => tool.name)],
      customTools,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader
    })

    return adaptAgentSession(session)
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

function adaptAgentSession(session: AgentSession): CreatedPiAgentSession {
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
    prompt: (message) => session.prompt(message),
    abort: () => session.abort(),
    subscribe: (listener) => session.subscribe((event) => {
      const streamingEvent = toStreamingEvent(session.sessionId, event)
      if (streamingEvent) listener(streamingEvent)
    }),
    dispose: () => session.dispose()
  }
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
