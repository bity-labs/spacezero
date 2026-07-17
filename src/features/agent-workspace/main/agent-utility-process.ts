import {
  app,
  BrowserWindow,
  shell,
  MessageChannelMain,
  type MessageEvent,
  type MessagePortMain,
  type UtilityProcess,
  utilityProcess
} from 'electron'
import log from 'electron-log/main'
import { join } from 'node:path'

import type {
  AbortAgentSessionRequest,
  AgentAddApiKeyRequest,
  AgentOAuthCallbackRequest,
  AgentPingRequest,
  AgentPingResponse,
  AgentProviderRequest,
  AgentSessionState,
  AgentStreamingEvent,
  AgentUtilityFrame,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest,
  ListAgentSkillsRequest,
  PromptAgentSessionRequest,
  ResolveAgentToolConfirmationCommandRequest
} from '../../../shared/agent-protocol'
import type { AgentToolConfirmationRequest } from '../../../shared/agent-session-projection.model'
import type { AgentSkillDiscovery } from '../shared/agent-skill.model'
import { IPC_CHANNELS } from '../../../shared/ipc'
import type { AuthTestResult, ModelAuthSettings } from '../../../shared/model-auth'
import type { AvailableModel, SetAgentModelRequest, SetAgentThinkingLevelRequest } from '../../../shared/model-settings'
import type { AgentToolExecutionEvent } from '../../../shared/workspace-tool-protocol'
import {
  createAgentSessionProjectionSequencer,
  type AgentSessionProjectionEventInput
} from './agent-projection-sequencer'
import type { AgentUtilityPort } from './agent-utility-broker'
import { AgentUtilityBroker } from './agent-utility-broker'
import { getWorkspaceToolExecutor } from './workspace-tool-control-plane'

const TOOL_CONFIRMATION_TIMEOUT_MS = 5 * 60_000

class MessagePortMainAgentUtilityPort implements AgentUtilityPort {
  constructor(private readonly port: MessagePortMain) {}

  postMessage(frame: AgentUtilityFrame): void {
    this.port.postMessage(frame)
  }

  onMessage(handler: (frame: AgentUtilityFrame) => void): void {
    this.port.on('message', (event: MessageEvent) => {
      handler(event.data as AgentUtilityFrame)
    })
    this.port.start()
  }

  onClose(handler: () => void): void {
    this.port.on('close', handler)
  }

  close(): void {
    this.port.close()
  }
}

export class AgentUtilityProcessHost {
  private utility: UtilityProcess | undefined
  private mainPort: MessagePortMainAgentUtilityPort | undefined
  private broker: AgentUtilityBroker | undefined
  private readonly eventListeners = new Set<(event: AgentStreamingEvent) => void>()
  private readonly pendingConfirmations = new Map<
    string,
    { sessionId: string; resolve: (approved: boolean) => void; timeout: NodeJS.Timeout }
  >()
  private readonly projectionSequencer = createAgentSessionProjectionSequencer()
  private stopping = false

  start(): void {
    if (this.utility) return

    this.stopping = false
    const agentDir = join(app.getPath('userData'), 'agent')
    const utility = utilityProcess.fork(join(__dirname, 'agent-utility.js'), [], {
      serviceName: 'spacezero-agent-utility',
      env: {
        ...process.env,
        SPACEZERO_AGENT_DIR: agentDir,
        PI_CODING_AGENT_DIR: agentDir
      }
    })
    const { port1, port2 } = new MessageChannelMain()
    const mainPort = new MessagePortMainAgentUtilityPort(port1)

    utility.once('exit', (code) => {
      if (this.stopping) {
        log.debug(`Agent utility process stopped with code ${code}`)
      } else {
        log.warn(`Agent utility process exited with code ${code}`)
      }

      this.rejectPendingConfirmations()
      this.broker?.dispose(new Error(`agent.utilityExited:${code ?? 'unknown'}`))
      this.mainPort?.close()
      this.utility = undefined
      this.broker = undefined
      this.mainPort = undefined
      this.stopping = false
    })

    utility.postMessage({ type: 'spacezero.agent.connect' }, [port2])

    this.utility = utility
    this.mainPort = mainPort
    getWorkspaceToolExecutor().setConfirmationRequester((request) =>
      this.requestToolConfirmation({ ...request, summary: request.sanitizedSummary })
    )

    this.broker = new AgentUtilityBroker(mainPort, {
      onEvent: (event) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(IPC_CHANNELS.agent.event, event)
        }
      },
      onProjectionEvent: ({ event }) => {
        this.sendProjectionEvent(event)
      },
      openExternal: (url) => shell.openExternal(url),
      executeWorkspaceTool: async (request) => {
        this.sendToolExecution({
          sessionId: request.sessionId,
          callId: request.callId,
          toolName: request.toolName,
          state: 'running',
          input: summarizeForRenderer(request.input)
        })

        const result = await getWorkspaceToolExecutor().executeForAgent(request)
        this.sendToolExecution({
          sessionId: request.sessionId,
          callId: request.callId,
          toolName: request.toolName,
          state: result.ok ? 'success' : 'error',
          input: summarizeForRenderer(request.input),
          output: summarizeForRenderer(result),
          error: result.ok ? undefined : result.error.message
        })
        return result
      }
    })
    for (const listener of this.eventListeners) this.broker.onStreamingEvent(listener)
  }

  ping(request: AgentPingRequest): Promise<AgentPingResponse> {
    return this.getBroker().ping(request)
  }

  createSession(request: CreateAgentSessionRequest): Promise<AgentSessionState> {
    return this.getBroker().createSession(request)
  }

  deleteSession(request: DeleteAgentSessionRequest): Promise<void> {
    return this.getBroker().deleteSession(request)
  }

  getState(request: GetAgentSessionStateRequest): Promise<AgentSessionState> {
    return this.getBroker().getState(request)
  }

  listSessions(): Promise<AgentSessionState[]> {
    return this.getBroker().listSessions()
  }

  listSkills(request: ListAgentSkillsRequest): Promise<AgentSkillDiscovery[]> {
    return this.getBroker().listSkills(request)
  }

  addApiKey(request: AgentAddApiKeyRequest): Promise<void> {
    return this.getBroker().addApiKey(request)
  }

  removeApiKey(request: AgentProviderRequest): Promise<void> {
    return this.getBroker().removeApiKey(request)
  }

  getAuthStatus(): Promise<ModelAuthSettings> {
    return this.getBroker().getAuthStatus()
  }

  getAvailableModels(): Promise<AvailableModel[]> {
    return this.getBroker().getAvailableModels()
  }

  setModel(request: SetAgentModelRequest): Promise<AgentSessionState> {
    return this.getBroker().setModel(request)
  }

  setThinkingLevel(request: SetAgentThinkingLevelRequest): Promise<AgentSessionState> {
    return this.getBroker().setThinkingLevel(request)
  }

  testAuth(request: AgentProviderRequest): Promise<AuthTestResult> {
    return this.getBroker().testAuth(request)
  }

  loginOAuth(request: AgentProviderRequest): Promise<void> {
    return this.getBroker().loginOAuth(request)
  }

  logoutOAuth(request: AgentProviderRequest): Promise<void> {
    return this.getBroker().logoutOAuth(request)
  }

  handleOAuthCallback(request: AgentOAuthCallbackRequest): Promise<{ handled: boolean }> {
    return this.getBroker().handleOAuthCallback(request)
  }

  async resolveToolConfirmation(request: ResolveAgentToolConfirmationCommandRequest): Promise<void> {
    const pending = this.pendingConfirmations.get(request.callId)
    if (pending && pending.sessionId === request.sessionId) {
      this.pendingConfirmations.delete(request.callId)
      clearTimeout(pending.timeout)
      pending.resolve(request.approved)
      this.sendProjectionEvent({
        type: 'tool_confirmation_resolved',
        sessionId: request.sessionId,
        callId: request.callId,
        approved: request.approved
      })
      return
    }

    return this.getBroker().resolveToolConfirmation(request)
  }

  prompt(request: PromptAgentSessionRequest): Promise<void> {
    return this.getBroker().prompt(request)
  }

  abort(request: AbortAgentSessionRequest): Promise<void> {
    return this.getBroker().abort(request)
  }

  onStreamingEvent(listener: (event: AgentStreamingEvent) => void): () => void {
    this.eventListeners.add(listener)
    const unsubscribe = this.broker?.onStreamingEvent(listener)
    return () => {
      unsubscribe?.()
      this.eventListeners.delete(listener)
    }
  }

  onEvent(listener: (event: AgentStreamingEvent) => void): () => void {
    return this.onStreamingEvent(listener)
  }

  private sendToolExecution(event: AgentToolExecutionEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.agent.toolExecution, event)
    }
  }

  private requestToolConfirmation(request: AgentToolConfirmationRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingConfirmations.get(request.callId)
        if (!pending) return
        this.pendingConfirmations.delete(request.callId)
        pending.resolve(false)
        this.sendProjectionEvent({
          type: 'tool_confirmation_resolved',
          sessionId: request.sessionId,
          callId: request.callId,
          approved: false
        })
      }, TOOL_CONFIRMATION_TIMEOUT_MS)
      this.pendingConfirmations.set(request.callId, {
        sessionId: request.sessionId,
        resolve,
        timeout
      })
      this.sendProjectionEvent({
        type: 'tool_confirmation_request',
        sessionId: request.sessionId,
        request
      })
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC_CHANNELS.agent.toolConfirmationRequest, request)
      }
    })
  }

  private rejectPendingConfirmations(): void {
    for (const [callId, pending] of this.pendingConfirmations.entries()) {
      clearTimeout(pending.timeout)
      pending.resolve(false)
      this.sendProjectionEvent({
        type: 'tool_confirmation_resolved',
        sessionId: pending.sessionId,
        callId,
        approved: false
      })
    }
    this.pendingConfirmations.clear()
  }

  private sendProjectionEvent(event: AgentSessionProjectionEventInput): void {
    const sequencedEvent = this.projectionSequencer.next(event)
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.agent.sessionProjectionEvent, sequencedEvent)
    }
  }

  private getBroker(): AgentUtilityBroker {
    this.start()

    if (!this.broker) {
      throw new Error('agent.utilityUnavailable')
    }

    return this.broker
  }

  stop(): void {
    this.stopping = this.utility !== undefined
    this.rejectPendingConfirmations()
    this.broker?.dispose(new Error('agent.utilityStopped'))
    this.mainPort?.close()
    this.utility?.kill()
    this.mainPort = undefined
    this.broker = undefined
    this.utility = undefined
  }
}

function summarizeForRenderer(value: unknown): unknown {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object') return typeof value
  if (Array.isArray(value)) return { type: 'array', itemCount: value.length }

  return { type: 'object', keys: Object.keys(value as Record<string, unknown>).sort() }
}

let host: AgentUtilityProcessHost | undefined

export function getAgentUtilityProcessHost(): AgentUtilityProcessHost {
  host ??= new AgentUtilityProcessHost()
  return host
}

export function stopAgentUtilityProcessHost(): void {
  host?.stop()
  host = undefined
}
