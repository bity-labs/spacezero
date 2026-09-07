import type {
  AgentReadOnlyInspectionTool,
  AgentToolConfiguration,
  AgentToolJsonObject,
} from "@spacezero/pi-adapter";
import type {
  AgentModelDescriptor,
  AgentRuntimeDefaults,
} from "@spacezero/host-contracts";
import type { ChatTurnToolPolicy } from "../chat-sessions/chat-turn-runner.service.js";

export type GlobalChatToolSafety = "read" | "write" | "dangerous";

export interface GlobalChatToolApprovalDecision {
  readonly status: "approved" | "requires_approval";
  readonly reason: string;
}

export interface GlobalChatInspectionToolDescriptor {
  readonly name: GlobalChatInspectionToolName;
  readonly description: string;
  readonly requiresManagedWorktree: false;
  readonly safety: GlobalChatToolSafety;
  readonly confirmation: "never";
  readonly approval: {
    readonly status: "approved";
    readonly confirmation: "never";
    readonly source: "default_policy";
    readonly reason: "approved_by_default";
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

export type GlobalChatInspectionToolName =
  | "workspace.getStatus"
  | "projects.listSummaries"
  | "globalChats.listSummaries"
  | "agentRuntime.getDefaults";

export interface WorkspaceStatusInput {
  readonly includeArchived: boolean;
}

export interface WorkspaceStatusSnapshot {
  readonly hostConnected: boolean;
  readonly hostKind: "local" | "remote";
  readonly projectCount: number;
  readonly unarchivedGlobalChatCount: number;
  readonly activeGlobalChatSessionId?: string;
  readonly activeProjectSessionId?: string;
}

export interface ProjectSummaryEntry {
  readonly id: string;
  readonly displayName: string;
}

export interface GlobalChatSummaryEntry {
  readonly id: string;
  readonly title: string;
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentRuntimeDefaultsDescriptor {
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly modelName: string;
  readonly defaultThinkingLevel:
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  readonly modelSupportsThinking: boolean;
}

export interface GlobalChatInspectionToolDependencies {
  /** Host deployment kind; the initial Workspace Host is the Local Host. */
  readonly hostKind?: "local" | "remote";
  /** Running app snapshot without paths, versions, or Host internals. */
  readonly getWorkspaceSnapshot: () => Promise<
    Omit<WorkspaceStatusSnapshot, "hostConnected" | "hostKind">
  >;
  /** Registered Project summaries; only id and displayName may be returned. */
  readonly listProjectSummaries: () => Promise<
    readonly (ProjectSummaryEntry & Record<string, unknown>)[]
  >;
  /** Global Chat summaries; archived sessions are filtered here by input. */
  readonly listGlobalChatSummaries: () => Promise<
    readonly GlobalChatSummaryEntry[]
  >;
  /** Host-global agent runtime defaults (may be unconfigured). */
  readonly getAgentRuntimeDefaults: () => Promise<AgentRuntimeDefaults>;
  /** Sanitized Host model catalog descriptors. */
  readonly listAgentModels: () => Promise<readonly AgentModelDescriptor[]>;
}

const objectSchema = (
  properties: Record<string, AgentToolJsonObject>,
): AgentToolJsonObject => ({
  type: "object",
  properties,
  additionalProperties: false,
});

const descriptors: readonly GlobalChatInspectionToolDescriptor[] = [
  {
    name: "workspace.getStatus",
    description:
      "Inspect the Space Zero workspace status: whether the Host is connected, the host kind, project count, unarchived Global Chat count, and active session ids. No paths, versions, credentials, or Host internals are returned.",
    requiresManagedWorktree: false,
    safety: "read",
    confirmation: "never",
    approval: {
      status: "approved",
      confirmation: "never",
      source: "default_policy",
      reason: "approved_by_default",
    },
    scope: "global-chat",
    input: objectSchema({}),
    output: objectSchema({
      hostConnected: { type: "boolean" },
      hostKind: { type: "string", enum: ["local", "remote"] },
      projectCount: { type: "integer" },
      unarchivedGlobalChatCount: { type: "integer" },
      activeGlobalChatSessionId: { type: "string" },
      activeProjectSessionId: { type: "string" },
    }),
    activitySummary: "Workspace status inspected",
  },
  {
    name: "projects.listSummaries",
    description:
      "List registered Projects with their id and display name only. Canonical paths, commits, Git state, files, worktrees, and credentials are never returned.",
    requiresManagedWorktree: false,
    safety: "read",
    confirmation: "never",
    approval: {
      status: "approved",
      confirmation: "never",
      source: "default_policy",
      reason: "approved_by_default",
    },
    scope: "global-chat",
    input: objectSchema({}),
    output: objectSchema({
      projects: {
        type: "array",
        items: objectSchema({
          id: { type: "string" },
          displayName: { type: "string" },
        }),
      },
    }),
    activitySummary: "Project summaries listed",
  },
  {
    name: "globalChats.listSummaries",
    description:
      "List unarchived Global Chat summaries by default. Pass includeArchived true to also include archived Global Chat summaries. Summaries are sanitized metadata only; full transcripts are never returned.",
    requiresManagedWorktree: false,
    safety: "read",
    confirmation: "never",
    approval: {
      status: "approved",
      confirmation: "never",
      source: "default_policy",
      reason: "approved_by_default",
    },
    scope: "global-chat",
    input: objectSchema({
      includeArchived: { type: "boolean" },
    }),
    output: objectSchema({
      sessions: {
        type: "array",
        items: objectSchema({
          id: { type: "string" },
          title: { type: "string" },
          archived: { type: "boolean" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        }),
      },
    }),
    activitySummary: "Global Chat summaries listed",
  },
  {
    name: "agentRuntime.getDefaults",
    description:
      "Inspect the Host-global agent runtime defaults as sanitized descriptors: provider id and name, model id and name, default thinking level, and whether the model supports thinking. Credentials, auth status, headers, and raw model metadata are never returned.",
    requiresManagedWorktree: false,
    safety: "read",
    confirmation: "never",
    approval: {
      status: "approved",
      confirmation: "never",
      source: "default_policy",
      reason: "approved_by_default",
    },
    scope: "global-chat",
    input: objectSchema({}),
    output: objectSchema({
      providerId: { type: "string" },
      providerName: { type: "string" },
      modelId: { type: "string" },
      modelName: { type: "string" },
      defaultThinkingLevel: { type: "string" },
      modelSupportsThinking: { type: "boolean" },
    }),
    activitySummary: "Agent runtime defaults read",
  },
];

const summaryForTool = (toolName: string, outcome: string): string => {
  const base =
    descriptors.find((tool) => tool.name === toolName)?.activitySummary ??
    `Tool ${toolName}`;
  const text =
    outcome === "succeeded" ? base : `${base} (${outcome})`.slice(0, 256);
  return text;
};

const runtimeDefaultsToolError = (reason: string): Error =>
  new Error(`agent runtime defaults unavailable: ${reason}`);

export interface GlobalChatInspectionWorkspaceTools {
  /** Exact approved tool set for Global Chat turns. */
  readonly descriptors: readonly GlobalChatInspectionToolDescriptor[];
  /** Host-approved read-only tool definitions for the Pi Adapter seam. */
  readonly turnTools: () => readonly AgentReadOnlyInspectionTool[];
  /** Pi Adapter tool configuration: read-only inspection only. */
  readonly turnToolConfiguration: () => AgentToolConfiguration;
  /** Chat turn tool policy used to annotate durable tool activity. */
  readonly chatTurnToolPolicy: ChatTurnToolPolicy;
  /** Authorization check for a tool name; everything outside the approved
   * read-only set is denied, including Project, Files, Git, worktree,
   * credential, raw Pi, Host-internal, and app-state mutation tools. */
  readonly authorizeTool: (toolName: string) => {
    readonly allowed: boolean;
    readonly reason?: string;
  };
  /** Concise summary for Agent Activity History rows. */
  readonly activitySummaryForTool: (toolName: string) => string;
}

export const createGlobalChatInspectionWorkspaceTools = (
  dependencies: GlobalChatInspectionToolDependencies,
): GlobalChatInspectionWorkspaceTools => {
  const execute = async (
    toolName: string,
    args: AgentToolJsonObject,
  ): Promise<AgentToolJsonObject> => {
    if (toolName === "workspace.getStatus") {
      const snapshot = await dependencies.getWorkspaceSnapshot();
      return {
        hostConnected: true,
        hostKind: dependencies.hostKind ?? "local",
        projectCount: snapshot.projectCount,
        unarchivedGlobalChatCount: snapshot.unarchivedGlobalChatCount,
        ...(snapshot.activeGlobalChatSessionId === undefined
          ? {}
          : { activeGlobalChatSessionId: snapshot.activeGlobalChatSessionId }),
        ...(snapshot.activeProjectSessionId === undefined
          ? {}
          : { activeProjectSessionId: snapshot.activeProjectSessionId }),
      };
    }
    if (toolName === "projects.listSummaries") {
      const projects = await dependencies.listProjectSummaries();
      return {
        projects: projects.map((project) => ({
          id: project.id,
          displayName: project.displayName,
        })),
      };
    }
    if (toolName === "globalChats.listSummaries") {
      const includeArchived = args.includeArchived === true;
      const sessions = await dependencies.listGlobalChatSummaries();
      return {
        sessions: sessions
          .filter((session) => includeArchived || !session.archived)
          .map((session) => ({
            id: session.id,
            title: session.title,
            archived: session.archived,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          })),
      };
    }
    if (toolName === "agentRuntime.getDefaults") {
      const defaults = await dependencies.getAgentRuntimeDefaults();
      if (!defaults.defaultModel)
        throw runtimeDefaultsToolError("no default model is configured");
      const descriptor = (await dependencies.listAgentModels()).find(
        (candidate) =>
          candidate.providerId === defaults.defaultModel!.providerId &&
          candidate.modelId === defaults.defaultModel!.modelId,
      );
      if (!descriptor)
        throw runtimeDefaultsToolError("the default model is unavailable");
      return {
        providerId: descriptor.providerId,
        providerName: descriptor.providerDisplayName,
        modelId: descriptor.modelId,
        modelName: descriptor.displayName,
        defaultThinkingLevel: defaults.defaultThinkingLevel ?? "off",
        modelSupportsThinking: descriptor.reasoningSupported,
      };
    }
    throw new Error(`Tool ${toolName} is not available in Global Chat`);
  };

  const approvedToolDescriptors = descriptors.filter(
    (tool) => tool.approval.status === "approved",
  );
  const approvedToolNames: readonly string[] = approvedToolDescriptors.map(
    (tool) => tool.name,
  );

  return {
    descriptors,
    turnTools: () =>
      approvedToolDescriptors.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input,
        execute: (args) => execute(tool.name, args),
      })),
    turnToolConfiguration: () => ({
      kind: "readOnlyInspection" as const,
      tools: [...approvedToolDescriptors].map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input,
        execute: (args) => execute(tool.name, args),
      })),
    }),
    chatTurnToolPolicy: {
      listTurnTools: () =>
        approvedToolDescriptors.map((tool) => ({
          name: tool.name,
          safety: tool.safety,
        })),
      approvalForTool: (toolName) =>
        approvedToolNames.includes(toolName)
          ? {
              status: "approved" as const,
              reason: "approved_by_default",
            }
          : {
              status: "requires_approval" as const,
              reason: "tool_denied_for_global_chat",
            },
    },
    authorizeTool: (toolName) =>
      approvedToolNames.includes(toolName)
        ? { allowed: true }
        : {
            allowed: false,
            reason: "tool_denied_for_global_chat",
          },
    activitySummaryForTool: (toolName: string) =>
      summaryForTool(toolName, "succeeded"),
  };
};

export const globalChatInspectionToolDescriptorFor = (
  toolName: string,
): GlobalChatInspectionToolDescriptor | undefined =>
  descriptors.find((tool) => tool.name === toolName);
