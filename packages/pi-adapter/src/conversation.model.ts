/**
 * Host-facing conversation seam owned by the Pi Adapter.
 *
 * These values are Space Zero's own domain types. Pi SDK types and transcript
 * formats never cross this boundary; a concrete Pi-backed runner implements
 * `ConversationRunner` without leaking implementation details upward.
 */

export type AgentTurnErrorCode = "agent_unavailable" | "agent_turn_failed";

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

export interface AgentTurnMessage {
  /** Stable Space Zero message role from the Session projection. */
  readonly role: "user" | "assistant";
  /** Completed message text. */
  readonly text: string;
}

export interface AgentToolConfiguration {
  /** Authenticated managed worktree path; tools must operate here. */
  readonly workingDirectory: string;
  /** Explicit initial Workspace Tool names enabled for this turn. */
  readonly enabledToolNames: readonly string[];
}

export interface AgentTurnInput {
  /** Project Session identity that owns this one Pi conversation. */
  readonly sessionId: string;
  /** Durable Pi conversation/context identity for the Project Session. */
  readonly conversationId: string;
  /** Authenticated managed worktree path; the agent must operate here. */
  readonly worktreePath: string;
  /** Prior completed Session messages, ordered oldest first. */
  readonly history: readonly AgentTurnMessage[];
  /** Explicit tool configuration for the authenticated worktree. */
  readonly tools: AgentToolConfiguration;
  /** Accepted user prompt text. */
  readonly prompt: string;
  /** Optional live fragment sink; fragments remain ephemeral. */
  readonly onDelta?: (delta: AgentTurnDelta) => void;
}

export interface AgentTurnResult {
  /** Completed assistant message text for the turn. */
  readonly text: string;
}

export interface ConversationRunner {
  readonly submitTurn: (input: AgentTurnInput) => Promise<AgentTurnResult>;
}
