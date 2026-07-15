import type {
  AgentActivityOutcome,
  WorkspaceToolResult,
  WorkspaceToolSafetyPolicy
} from '../shared/workspace-tool.model'

import type { AgentActivityHistory } from './agent-activity-history'
import { evaluateSafetyPolicy } from './workspace-tool-safety-policy'
import type { WorkspaceToolRegistry } from './workspace-tool-registry'

export type WorkspaceToolConfirmationRequest = {
  sessionId: string
  callId: string
  toolName: string
  sanitizedSummary: string
}

export type WorkspaceToolExecutorInit = {
  registry: WorkspaceToolRegistry
  policy: WorkspaceToolSafetyPolicy
  history: AgentActivityHistory
  requestConfirmation?: (request: WorkspaceToolConfirmationRequest) => Promise<boolean>
}

export type { WorkspaceToolResult }

/**
 * Executes Workspace Tool calls through the Workspace Control Plane pipeline:
 *
 * 1. resolve a tool by name
 * 2. validate input against the tool's zod schema
 * 3. evaluate the global safety policy before state-changing/dangerous handlers
 * 4. execute the handler
 * 5. return structured data only
 * 6. record lightweight Agent Activity History metadata
 *
 * The executor never exposes SQLite, raw IPC, the filesystem, or renderer
 * internals to agents; handlers are feature-owned application services.
 */
export class WorkspaceToolExecutor {
  private readonly registry: WorkspaceToolRegistry
  private readonly policy: WorkspaceToolSafetyPolicy
  private readonly history: AgentActivityHistory
  private requestConfirmation: ((request: WorkspaceToolConfirmationRequest) => Promise<boolean>) | undefined

  constructor(init: WorkspaceToolExecutorInit) {
    this.registry = init.registry
    this.policy = init.policy
    this.history = init.history
    this.requestConfirmation = init.requestConfirmation
  }

  setConfirmationRequester(requestConfirmation: (request: WorkspaceToolConfirmationRequest) => Promise<boolean>): void {
    this.requestConfirmation = requestConfirmation
  }

  async execute(toolName: string, input: unknown): Promise<WorkspaceToolResult> {
    return this.executeForAgent({ sessionId: 'unknown', callId: 'unknown', toolName, input })
  }

  async executeForAgent(request: {
    sessionId: string
    callId: string
    toolName: string
    input: unknown
  }): Promise<WorkspaceToolResult> {
    const { sessionId, callId, toolName, input } = request
    const tool = this.registry.resolve(toolName)

    if (!tool) {
      this.record({ toolName, outcome: 'rejected' })
      return {
        ok: false,
        error: { code: 'unknown-tool', message: `Workspace tool not found: ${toolName}` }
      }
    }

    const parsed = tool.inputSchema.safeParse(input)
    if (!parsed.success) {
      this.record({
        toolName,
        outcome: 'rejected',
        safetyLevel: tool.safetyLevel,
        kind: tool.kind,
        domain: tool.domain
      })
      return {
        ok: false,
        error: {
          code: 'invalid-input',
          message: parsed.error.issues.map((i) => i.message).join('; ')
        }
      }
    }

    const decision = evaluateSafetyPolicy(tool.safetyLevel, this.policy)
    if (!decision.allowed) {
      this.record({
        toolName,
        outcome: 'confirmation-required',
        safetyLevel: tool.safetyLevel,
        kind: tool.kind,
        domain: tool.domain
      })

      if (!this.requestConfirmation) {
        return {
          ok: false,
          error: {
            code: 'confirmation-required',
            message: `Workspace tool requires confirmation: ${toolName}`
          }
        }
      }

      const approved = await this.requestConfirmation({
        sessionId,
        callId,
        toolName,
        sanitizedSummary: tool.confirmationSummary?.(parsed.data) ?? `Run Workspace Tool ${toolName}`
      })

      if (!approved) {
        const error = { code: 'tool-denied', message: `Workspace tool denied by builder: ${toolName}` }
        this.record({
          toolName,
          outcome: 'denied',
          safetyLevel: tool.safetyLevel,
          kind: tool.kind,
          domain: tool.domain,
          error
        })
        return { ok: false, error }
      }
    }

    try {
      const result = await tool.handler(parsed.data)
      const outcome: AgentActivityOutcome = result.ok ? 'success' : 'error'
      this.record({
        toolName,
        outcome,
        safetyLevel: tool.safetyLevel,
        kind: tool.kind,
        domain: tool.domain,
        error: result.ok ? undefined : result.error
      })
      return result
    } catch (error) {
      this.record({
        toolName,
        outcome: 'error',
        safetyLevel: tool.safetyLevel,
        kind: tool.kind,
        domain: tool.domain,
        error: {
          code: 'handler-error',
          message: error instanceof Error ? error.message : String(error)
        }
      })
      return {
        ok: false,
        error: {
          code: 'handler-error',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }

  private record(entry: Parameters<AgentActivityHistory['record']>[0]): void {
    try {
      this.history.record(entry)
    } catch {
      // Activity history is an observability boundary. Recording failures must
      // not break the structured Workspace Tool execution contract or turn a
      // successful tool result into an unstructured exception.
    }
  }
}
