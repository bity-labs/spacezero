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
export type AgentToolJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly AgentToolJsonValue[]
  | { readonly [key: string]: AgentToolJsonValue };

export interface AgentToolJsonObject {
  readonly [key: string]: AgentToolJsonValue;
}

export type AgentToolImageMimeType =
  "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type AgentToolDisplayContent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image";
      readonly data: string;
      readonly mimeType: AgentToolImageMimeType;
    }
  | {
      readonly type: "unsupported";
      readonly label: string;
    };

export interface AgentToolDisplayResult {
  readonly content: readonly AgentToolDisplayContent[];
  readonly truncated?: boolean;
}

export interface AgentTurnTextPart {
  readonly type: "text";
  readonly order: number;
  readonly text: string;
}

export interface AgentTurnReasoningPart {
  readonly type: "reasoning";
  readonly order: number;
  readonly text: string;
}

export interface AgentTurnToolCallPart {
  readonly type: "tool-call";
  readonly order: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: "running" | "succeeded" | "failed";
  readonly arguments?: AgentToolJsonObject;
  readonly progress?: string;
  readonly result?: AgentToolDisplayResult;
  readonly safety?: "read" | "write" | "dangerous";
  readonly approvalStatus?: "approved" | "requires_approval";
  readonly approvalReason?: string;
}

export type AgentTurnContentPart =
  AgentTurnTextPart | AgentTurnReasoningPart | AgentTurnToolCallPart;

export type AgentTurnAssistantContentPart =
  AgentTurnTextPart | AgentTurnReasoningPart;

export interface AgentTurnDelta {
  readonly kind: "assistant_content";
  readonly part: AgentTurnAssistantContentPart;
  /** Zero-based assistant message index within the current agent turn. */
  readonly messageIndex?: number;
}

export type AgentRuntimeEvent =
  | {
      readonly type: "assistant_delta";
      readonly part: AgentTurnAssistantContentPart;
      /** Zero-based assistant message index within the current agent turn. */
      readonly messageIndex?: number;
    }
  | {
      readonly type: "tool_started";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly arguments?: AgentToolJsonObject;
    }
  | {
      readonly type: "tool_updated";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly progress?: AgentToolDisplayResult;
    }
  | {
      readonly type: "tool_completed";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly isError: boolean;
      readonly result?: AgentToolDisplayResult;
    }
  | {
      readonly type: "tool_denied";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly reason: string;
    };

export interface AgentTurnMessage {
  /** Stable Space Zero message role from the Session projection. */
  readonly role: "user" | "assistant";
  /** Completed message text. */
  readonly text: string;
}

/** Host-approved read-only inspection tool handed to the Pi Adapter. The
 * input schema is a plain JSON Schema object so no Pi SDK type crosses the
 * seam; execution stays inside the Host process and returns sanitized JSON. */
export interface AgentReadOnlyInspectionTool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema describing the accepted tool input. */
  readonly parameters: AgentToolJsonObject;
  /** Host-side sanitized read-only execution. */
  readonly execute: (args: AgentToolJsonObject) => Promise<AgentToolJsonObject>;
}

/** Host-approved app-state mutation tool handed to the Pi Adapter. Mutation
 * tools are never executed without an explicit confirmation decision from the
 * Host-owned confirmation gate; execution stays inside the Host process and
 * returns sanitized JSON only. */
export interface AgentConfirmedMutationTool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema describing the accepted tool input. */
  readonly parameters: AgentToolJsonObject;
  /** Host-side sanitized mutation execution. */
  readonly execute: (args: AgentToolJsonObject) => Promise<AgentToolJsonObject>;
}

/** Explicit per-call decision made by the Host-owned confirmation gate. A
 * missing or non-approved decision always denies the tool call. */
export interface AgentToolConfirmationDecision {
  readonly approved: boolean;
  readonly reason?: string;
}

export type AgentToolConfirmationGate = (input: {
  readonly toolName: string;
  readonly args: AgentToolJsonObject;
}) => Promise<AgentToolConfirmationDecision>;

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
    }
  | {
      readonly kind: "readOnlyInspection";
      /** Explicit Host-approved read-only inspection tools for this turn.
       * Only these tool names can ever be called; everything else is denied. */
      readonly tools: readonly AgentReadOnlyInspectionTool[];
    }
  | {
      readonly kind: "inspectionWithConfirmedMutation";
      /** Explicit Host-approved read-only inspection tools for this turn. */
      readonly tools: readonly AgentReadOnlyInspectionTool[];
      /** Host-approved app-state mutation tools for this turn. Each call is
       * gated behind `confirmToolCall`; without an explicit approval decision
       * the call is denied before it can execute. */
      readonly confirmedTools: readonly AgentConfirmedMutationTool[];
      /** Host-owned confirmation gate consulted before each confirmed tool
       * call; the default Host policy denies every call. */
      readonly confirmToolCall: AgentToolConfirmationGate;
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

export interface AgentTurnAssistantMessage {
  /** Completed assistant message text. May be empty when the message contains only non-text parts. */
  readonly text: string;
  /** Completed safe displayable assistant content in provider order for this message. */
  readonly parts?: readonly AgentTurnContentPart[];
}

export interface AgentTurnResult {
  /** Completed assistant text for legacy single-message callers. */
  readonly text: string;
  /** Completed safe displayable assistant content for legacy single-message callers. */
  readonly parts?: readonly AgentTurnContentPart[];
  /** Completed assistant messages in provider order for this turn. */
  readonly messages?: readonly AgentTurnAssistantMessage[];
}

export interface ConversationRunner {
  readonly submitTurn: (input: AgentTurnInput) => Promise<AgentTurnResult>;
}
