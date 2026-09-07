import { describe, expect, it } from "vitest";
import type {
  AgentModelDescriptor,
  AgentRuntimeDefaults,
} from "@spacezero/host-contracts";
import {
  createGlobalChatInspectionWorkspaceTools,
  type GlobalChatSummaryEntry,
  type ProjectSummaryEntry,
} from "../dist/features/workspace-tools/global-chat-inspection-tools.js";

const modelDescriptor = (
  overrides: Partial<AgentModelDescriptor> = {},
): AgentModelDescriptor => ({
  providerId: "anthropic",
  providerDisplayName: "Anthropic",
  modelId: "claude-sonnet-4-5",
  displayName: "Claude Sonnet 4.5",
  authenticated: true,
  available: true,
  reasoningSupported: true,
  supportedThinkingLevels: ["off", "low", "high"],
  ...overrides,
});

const createTools = (
  overrides: {
    readonly snapshot?: Partial<{
      projectCount: number;
      unarchivedGlobalChatCount: number;
      activeGlobalChatSessionId?: string;
      activeProjectSessionId?: string;
    }>;
    readonly projects?: readonly (ProjectSummaryEntry &
      Record<string, unknown>)[];
    readonly globalChats?: readonly GlobalChatSummaryEntry[];
    readonly defaults?: AgentRuntimeDefaults;
    readonly models?: readonly AgentModelDescriptor[];
  } = {},
) =>
  createGlobalChatInspectionWorkspaceTools({
    hostKind: "local",
    getWorkspaceSnapshot: async () => ({
      projectCount: overrides.snapshot?.projectCount ?? 2,
      unarchivedGlobalChatCount:
        overrides.snapshot?.unarchivedGlobalChatCount ?? 3,
      ...(overrides.snapshot?.activeGlobalChatSessionId === undefined
        ? {}
        : {
            activeGlobalChatSessionId:
              overrides.snapshot.activeGlobalChatSessionId,
          }),
      ...(overrides.snapshot?.activeProjectSessionId === undefined
        ? {}
        : {
            activeProjectSessionId: overrides.snapshot.activeProjectSessionId,
          }),
    }),
    listProjectSummaries: async () =>
      overrides.projects ?? [
        {
          id: "p1",
          displayName: "Wine App",
          canonicalPath: "/home/builder/projects/wine-app",
          registeredHeadCommit: "a".repeat(40),
        },
      ],
    listGlobalChatSummaries: async () =>
      overrides.globalChats ?? [
        {
          id: "g1",
          title: "Open chat",
          archived: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        },
        {
          id: "g2",
          title: "Old chat",
          archived: true,
          archivedAt: "2026-01-03T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-03T00:00:00Z",
        },
      ],
    getAgentRuntimeDefaults: async () =>
      overrides.defaults ?? {
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
        defaultThinkingLevel: "low",
      },
    listAgentModels: async () => overrides.models ?? [modelDescriptor()],
  });

const turnTool = (
  tools: ReturnType<typeof createTools>,
  name: string,
): { execute: (args: Record<string, unknown>) => Promise<unknown> } => {
  const tool = tools.turnTools().find((candidate) => candidate.name === name);
  expect(tool).toBeDefined();
  return tool as {
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

describe("Global Chat read-only inspection Workspace Tools", () => {
  it("declares exactly the approved read-only inspection tool set", () => {
    const tools = createTools();

    expect(tools.descriptors.map((tool) => tool.name)).toEqual([
      "workspace.getStatus",
      "projects.listSummaries",
      "globalChats.listSummaries",
      "agentRuntime.getDefaults",
    ]);
    for (const descriptor of tools.descriptors) {
      expect(descriptor.safety).toBe("read");
      expect(descriptor.confirmation).toBe("never");
      expect(descriptor.approval).toEqual({
        status: "approved",
        confirmation: "never",
        source: "default_policy",
        reason: "approved_by_default",
      });
      expect(descriptor.scope).toBe("global-chat");
      expect(descriptor.requiresManagedWorktree).toBe(false);
      expect(Object.keys(descriptor.input)).toContain("type");
      expect(Object.keys(descriptor.output)).toContain("type");
    }
  });

  it("annotates the chat turn policy with read safety and default approval", () => {
    const tools = createTools();

    expect(tools.chatTurnToolPolicy.listTurnTools()).toEqual([
      { name: "workspace.getStatus", safety: "read" },
      { name: "projects.listSummaries", safety: "read" },
      { name: "globalChats.listSummaries", safety: "read" },
      { name: "agentRuntime.getDefaults", safety: "read" },
    ]);
    expect(
      tools.chatTurnToolPolicy.approvalForTool("workspace.getStatus"),
    ).toEqual({ status: "approved", reason: "approved_by_default" });
  });

  it("denies Project, worktree, mutation, credential, raw Pi, Host-internal, and app-state mutation tools", () => {
    const tools = createTools();

    for (const denied of [
      "read",
      "write",
      "edit",
      "bash",
      "git.status",
      "files.list",
      "worktree.branch",
      "credential.read",
      "pi.transcript",
      "host.internal",
      "app.settings.update",
      "unknown.tool",
    ]) {
      expect(tools.authorizeTool(denied)).toEqual({
        allowed: false,
        reason: "tool_denied_for_global_chat",
      });
      expect(tools.chatTurnToolPolicy.approvalForTool(denied)).toEqual({
        status: "requires_approval",
        reason: "tool_denied_for_global_chat",
      });
    }
  });

  it("returns the sanitized workspace status fields only", async () => {
    const tools = createTools({
      snapshot: {
        projectCount: 4,
        unarchivedGlobalChatCount: 7,
        activeGlobalChatSessionId: "global-1",
        activeProjectSessionId: "project-1",
      },
    });

    await expect(
      turnTool(tools, "workspace.getStatus").execute({}),
    ).resolves.toEqual({
      hostConnected: true,
      hostKind: "local",
      projectCount: 4,
      unarchivedGlobalChatCount: 7,
      activeGlobalChatSessionId: "global-1",
      activeProjectSessionId: "project-1",
    });
  });

  it("omits optional active session ids when no session is active", async () => {
    const tools = createTools({
      snapshot: { projectCount: 0, unarchivedGlobalChatCount: 1 },
    });

    await expect(
      turnTool(tools, "workspace.getStatus").execute({}),
    ).resolves.toEqual({
      hostConnected: true,
      hostKind: "local",
      projectCount: 0,
      unarchivedGlobalChatCount: 1,
    });
  });

  it("returns only project id and display name", async () => {
    const tools = createTools();

    const result = (await turnTool(tools, "projects.listSummaries").execute(
      {},
    )) as { projects: Record<string, unknown>[] };

    expect(result.projects).toEqual([{ id: "p1", displayName: "Wine App" }]);
    expect(JSON.stringify(result)).not.toContain("/home/builder");
    expect(JSON.stringify(result)).not.toContain("registeredHeadCommit");
  });

  it("lists unarchived Global Chat summaries by default and archived ones only on request", async () => {
    const tools = createTools();

    await expect(
      turnTool(tools, "globalChats.listSummaries").execute({}),
    ).resolves.toEqual({
      sessions: [
        {
          id: "g1",
          title: "Open chat",
          archived: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        },
      ],
    });

    await expect(
      turnTool(tools, "globalChats.listSummaries").execute({
        includeArchived: true,
      }),
    ).resolves.toEqual({
      sessions: expect.arrayContaining([
        expect.objectContaining({ id: "g1" }),
        expect.objectContaining({ id: "g2", archived: true }),
      ]),
    });
  });

  it("returns sanitized agent runtime descriptors only", async () => {
    const tools = createTools();

    await expect(
      turnTool(tools, "agentRuntime.getDefaults").execute({}),
    ).resolves.toEqual({
      providerId: "anthropic",
      providerName: "Anthropic",
      modelId: "claude-sonnet-4-5",
      modelName: "Claude Sonnet 4.5",
      defaultThinkingLevel: "low",
      modelSupportsThinking: true,
    });
  });

  it("reports modelSupportsThinking false for a non-reasoning default model", async () => {
    const tools = createTools({
      defaults: {
        defaultModel: { providerId: "openai", modelId: "gpt-5-mini" },
        defaultThinkingLevel: "off",
      },
      models: [
        modelDescriptor({
          providerId: "openai",
          providerDisplayName: "OpenAI",
          modelId: "gpt-5-mini",
          displayName: "GPT 5 Mini",
          reasoningSupported: false,
          supportedThinkingLevels: ["off"],
        }),
      ],
    });

    await expect(
      turnTool(tools, "agentRuntime.getDefaults").execute({}),
    ).resolves.toEqual({
      providerId: "openai",
      providerName: "OpenAI",
      modelId: "gpt-5-mini",
      modelName: "GPT 5 Mini",
      defaultThinkingLevel: "off",
      modelSupportsThinking: false,
    });
  });

  it("fails the agentRuntime tool with a sanitized error when no default model is configured", async () => {
    const tools = createTools({
      defaults: { defaultModel: null, defaultThinkingLevel: null },
    });

    await expect(
      turnTool(tools, "agentRuntime.getDefaults").execute({}),
    ).rejects.toThrow("no default model is configured");
  });

  it("exposes the read-only inspection Pi Adapter tool configuration", () => {
    const tools = createTools();
    const configuration = tools.turnToolConfiguration();

    expect(configuration.kind).toBe("readOnlyInspection");
    if (configuration.kind !== "readOnlyInspection") throw new Error("kind");
    expect(configuration.tools.map((tool) => tool.name)).toEqual([
      "workspace.getStatus",
      "projects.listSummaries",
      "globalChats.listSummaries",
      "agentRuntime.getDefaults",
    ]);
    for (const tool of configuration.tools)
      expect(typeof tool.execute).toBe("function");
  });
});
