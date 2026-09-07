import { randomUUID } from "node:crypto";
import type {
  AgentConfirmedMutationTool,
  AgentToolConfiguration,
  AgentToolConfirmationDecision,
  AgentToolDisplayResult,
  AgentToolJsonObject,
} from "@spacezero/pi-adapter";
import type { ChatTurnToolPolicy } from "../chat-sessions/chat-turn-runner.service.js";
import type { GlobalChatInspectionWorkspaceTools } from "./global-chat-inspection-tools.js";

export type GlobalChatMutationToolName = "globalChats.createWithPrompt";

/** The Host-enforced confirmation reason for Global Chat mutation tools.
 * Every call is denied unless the Host-owned confirmation gate explicitly
 * approves it; the denial is visible to the agent and in Agent Activity
 * History. */
export const GLOBAL_CHAT_MUTATION_CONFIRMATION_REASON =
  "user_confirmation_required";

export const GLOBAL_CHAT_CREATE_WITH_PROMPT_TOOL_NAME: GlobalChatMutationToolName =
  "globalChats.createWithPrompt";

/** Same bounds as the Host Contracts first-prompt prompt validation. */
export const GLOBAL_CHAT_PROMPT_MAX_LENGTH = 16_000;

export interface GlobalChatCreatedSessionSummary {
  readonly id: string;
  readonly title: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type GlobalChatMutationToolOutcome = "succeeded" | "failed" | "denied";

export type GlobalChatMutationConfirmationGate = (input: {
  readonly callingSessionId: string;
  readonly toolName: string;
  readonly args: AgentToolJsonObject;
}) => Promise<AgentToolConfirmationDecision>;

export interface GlobalChatMutationToolDescriptor {
  readonly name: GlobalChatMutationToolName;
  readonly description: string;
  readonly requiresManagedWorktree: false;
  readonly safety: "write";
  readonly confirmation: "ask";
  readonly approval: {
    readonly status: "requires_approval";
    readonly confirmation: "ask";
    readonly source: "default_policy";
    readonly reason: "user_confirmation_required";
  };
  /** Global Chat authorization scope: this tool exists only for Global Chat
   * Sessions and is never exposed to Project Sessions or other identities. */
  readonly scope: "global-chat";
  /** JSON Schema of the accepted tool input. */
  readonly input: AgentToolJsonObject;
  /** JSON Schema shape of the sanitized tool output. */
  readonly output: AgentToolJsonObject;
  /** Concise activity-history summary for a successful call. */
  readonly activitySummary: string;
}

export interface GlobalChatMutationWorkspaceToolDependencies {
  /** Host-approved read-only inspection tools; mutation tools extend, and
   * never replace, the approved read-only set. */
  readonly inspectionTools: GlobalChatInspectionWorkspaceTools;
  /** Host-owned idempotent create-with-first-prompt behavior. The tool only
   * forwards the user-approved prompt; the Host owns idempotency, the
   * durable Session, and the first-prompt title rule. */
  readonly createSessionWithFirstPrompt: (input: {
    readonly commandId: string;
    readonly firstPrompt: string;
  }) => Promise<GlobalChatCreatedSessionSummary>;
  /** Host-owned confirmation gate. Without an explicit approval decision the
   * call is denied before the Session is created. */
  readonly confirmToolCall: GlobalChatMutationConfirmationGate;
}

export interface GlobalChatMutationWorkspaceTools {
  readonly descriptors: readonly GlobalChatMutationToolDescriptor[];
  /** Pi Adapter tool configuration for a Global Chat turn: approved read-only
   * inspection tools plus confirmation-gated mutation tools. */
  readonly turnToolConfiguration: (input: {
    readonly callingSessionId: string;
  }) => AgentToolConfiguration;
  /** Chat turn tool policy used to annotate durable tool activity. */
  readonly chatTurnToolPolicy: ChatTurnToolPolicy;
  /** Authorization check for a tool name; only the approved read-only set and
   * the confirmed mutation tool are allowed for Global Chat. */
  readonly authorizeTool: (toolName: string) => {
    readonly allowed: boolean;
    readonly reason?: string;
  };
  /** Concise summary for Agent Activity History rows; the sanitized created
   * session id is included, full prompt content never is. */
  readonly activitySummaryForTool: (input: {
    readonly toolName: string;
    readonly outcome: GlobalChatMutationToolOutcome;
    readonly result?: AgentToolDisplayResult | undefined;
  }) => string;
}

const objectSchema = (
  properties: Record<string, AgentToolJsonObject>,
): AgentToolJsonObject => ({
  type: "object",
  properties,
  additionalProperties: false,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const descriptor: GlobalChatMutationToolDescriptor = {
  name: GLOBAL_CHAT_CREATE_WITH_PROMPT_TOOL_NAME,
  description:
    "Create a new durable Global Chat Session from a first prompt. Every call requires explicit user confirmation before the Session is created; denied calls create nothing. Returns only the sanitized created-session summary (id, title, archived, createdAt, updatedAt). It never switches the active chat route and never returns Project, Files, Git, worktree, credential, raw Pi, Host-internal, or transcript data.",
  requiresManagedWorktree: false,
  safety: "write",
  confirmation: "ask",
  approval: {
    status: "requires_approval",
    confirmation: "ask",
    source: "default_policy",
    reason: "user_confirmation_required",
  },
  scope: "global-chat",
  input: objectSchema({
    prompt: {
      type: "string",
      minLength: 1,
      maxLength: GLOBAL_CHAT_PROMPT_MAX_LENGTH,
    },
  }),
  output: objectSchema({
    id: { type: "string" },
    title: { type: "string" },
    archived: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  }),
  activitySummary: "Global Chat session created",
};

/** Validates the tool input with the same prompt rules as Global Chat
 * first-prompt creation: a non-blank string of at most 16,000 characters. */
export const validateGlobalChatCreateWithPromptPrompt = (
  args: AgentToolJsonObject,
): string => {
  const prompt = args.prompt;
  if (typeof prompt !== "string")
    throw new Error("prompt is required and must be a string");
  if (prompt.length === 0 || prompt.trim().length === 0)
    throw new Error("prompt must not be blank");
  if (prompt.length > GLOBAL_CHAT_PROMPT_MAX_LENGTH)
    throw new Error(
      `prompt must not exceed ${GLOBAL_CHAT_PROMPT_MAX_LENGTH} characters`,
    );
  return prompt.trim();
};

const sanitizedCreatedSummary = (
  created: GlobalChatCreatedSessionSummary,
): AgentToolJsonObject => ({
  id: created.id,
  title: created.title,
  archived: created.archived,
  createdAt: created.createdAt,
  updatedAt: created.updatedAt,
});

const createdSessionIdFromResult = (
  result: AgentToolDisplayResult | undefined,
): string | undefined => {
  if (result === undefined) return undefined;
  for (const content of result.content) {
    if (content.type !== "text") continue;
    try {
      const parsed: unknown = JSON.parse(content.text);
      if (
        isRecord(parsed) &&
        typeof parsed.id === "string" &&
        parsed.id.length > 0
      )
        return parsed.id;
    } catch {
      // Non-JSON or non-namespace results fall back to the generic summary.
    }
  }
  return undefined;
};

export const createGlobalChatMutationWorkspaceTools = (
  dependencies: GlobalChatMutationWorkspaceToolDependencies,
): GlobalChatMutationWorkspaceTools => {
  const inspectionConfiguration = dependencies.inspectionTools;

  const execute = async (
    args: AgentToolJsonObject,
  ): Promise<AgentToolJsonObject> => {
    const prompt = validateGlobalChatCreateWithPromptPrompt(args);
    const created = await dependencies.createSessionWithFirstPrompt({
      commandId: randomUUID(),
      firstPrompt: prompt,
    });
    return sanitizedCreatedSummary(created);
  };

  const confirmedTools = (): readonly AgentConfirmedMutationTool[] => [
    {
      name: descriptor.name,
      description: descriptor.description,
      parameters: descriptor.input,
      execute,
    },
  ];

  return {
    descriptors: [descriptor],
    turnToolConfiguration: ({ callingSessionId }) => {
      const readOnlyConfiguration =
        inspectionConfiguration.turnToolConfiguration();
      if (readOnlyConfiguration.kind !== "readOnlyInspection")
        throw new Error(
          "Global Chat turn tools require the readOnlyInspection configuration",
        );
      return {
        kind: "inspectionWithConfirmedMutation",
        tools: readOnlyConfiguration.tools,
        confirmedTools: confirmedTools(),
        confirmToolCall: (input) =>
          dependencies.confirmToolCall({
            callingSessionId,
            toolName: input.toolName,
            args: input.args,
          }),
      };
    },
    chatTurnToolPolicy: {
      listTurnTools: () => [
        ...inspectionConfiguration.chatTurnToolPolicy.listTurnTools(),
        { name: descriptor.name, safety: descriptor.safety },
      ],
      approvalForTool: (toolName) =>
        toolName === descriptor.name
          ? {
              status: "requires_approval" as const,
              reason: "user_confirmation_required",
            }
          : inspectionConfiguration.chatTurnToolPolicy.approvalForTool(
              toolName,
            ),
    },
    authorizeTool: (toolName) =>
      toolName === descriptor.name
        ? { allowed: true }
        : inspectionConfiguration.authorizeTool(toolName),
    activitySummaryForTool: ({ toolName, outcome, result }) => {
      if (toolName !== descriptor.name)
        return inspectionConfiguration.activitySummaryForTool(toolName);
      if (outcome !== "succeeded") return "Global Chat session create";
      const createdSessionId = createdSessionIdFromResult(result);
      return createdSessionId === undefined
        ? descriptor.activitySummary
        : `${descriptor.activitySummary} (${createdSessionId})`;
    },
  };
};
