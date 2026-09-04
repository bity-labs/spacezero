/**
 * Host-facing conversation seam owned by the Pi Adapter.
 *
 * These values are Space Zero's own domain types. Pi SDK types and transcript
 * formats never cross this boundary; a concrete Pi-backed runner implements
 * `ConversationRunner` without leaking implementation details upward.
 */

export type AgentTurnErrorCode =
  | "agent_unavailable"
  | "agent_authentication_required"
  | "agent_configuration_invalid"
  | "agent_turn_failed"
  | "agent_turn_interrupted";

export class AgentTurnError extends Error {
  constructor(readonly code: AgentTurnErrorCode) {
    super(code);
  }
}

/**
 * Ephemeral live fragment of an agent turn. Deltas never advance the Session
 * Event Journal cursor; only completed message boundaries are durable.
 */
export interface AgentTurnDelta {
  readonly kind: "assistant_text";
  readonly text: string;
}

export type AgentRuntimeEvent =
  | { readonly type: "assistant_delta"; readonly text: string }
  | {
      readonly type: "tool_started";
      readonly toolCallId: string;
      readonly toolName: string;
    }
  | {
      readonly type: "tool_updated";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
    }
  | {
      readonly type: "tool_completed";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly isError: boolean;
    };

export interface AgentTurnMessage {
  /** Stable Space Zero message role from the Session projection. */
  readonly role: "user" | "assistant";
  /** Completed message text. */
  readonly text: string;
}

export type AgentToolConfiguration =
  | {
      readonly kind: "managedWorktree";
      /** Authenticated managed worktree path; tools must operate here. */
      readonly workingDirectory: string;
      /** Explicit initial Workspace Tool names enabled for this turn. */
      readonly enabledToolNames: readonly string[];
    }
  | {
      readonly kind: "none";
      /** Global/tool-less chat turns must not enable worktree, Files, or Git tools. */
      readonly enabledToolNames: readonly string[];
    };

export interface AgentTurnRuntimeConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly thinkingLevel:
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

export interface AgentTurnPrivateStateContext {
  readonly stateId: string;
  readonly operationId: string;
}

export interface AgentSkillResource {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

export interface AgentTurnResources {
  readonly skills: readonly AgentSkillResource[];
}

export interface AgentTurnInput {
  /** Chat Session identity that owns this one Pi conversation. */
  readonly sessionId: string;
  /** Durable Pi conversation/context identity for the Chat Session. */
  readonly conversationId: string;
  /** Prior completed Session messages, ordered oldest first. */
  readonly history: readonly AgentTurnMessage[];
  /** Explicit Host-approved tool configuration for this chat context. */
  readonly tools: AgentToolConfiguration;
  /** Effective model and thinking configuration snapshotted for this turn. */
  readonly runtime: AgentTurnRuntimeConfiguration;
  /** Opaque adapter-private state context. */
  readonly privateState?: AgentTurnPrivateStateContext;
  /** Explicit Host-approved resources for this turn. */
  readonly resources?: AgentTurnResources;
  /** Accepted user prompt text. */
  readonly prompt: string;
  /** Optional cancellation signal for the active turn. */
  readonly signal?: AbortSignal;
  /** Optional live fragment sink; fragments remain ephemeral. */
  readonly onDelta?: (delta: AgentTurnDelta) => void;
  /** Optional sanitized runtime event sink. Raw Pi events never cross this seam. */
  readonly onEvent?: (event: AgentRuntimeEvent) => void | Promise<void>;
}

export interface AgentTurnResult {
  /** Completed assistant message text for the turn. */
  readonly text: string;
}

export interface ConversationRunner {
  readonly submitTurn: (input: AgentTurnInput) => Promise<AgentTurnResult>;
}
