import { describe, expect, it } from "vitest";
import type { AgentToolDisplayResult } from "@spacezero/pi-adapter";
import {
  createGlobalChatMutationWorkspaceTools,
  GLOBAL_CHAT_CREATE_WITH_PROMPT_TOOL_NAME,
  GLOBAL_CHAT_MUTATION_CONFIRMATION_REASON,
  GLOBAL_CHAT_PROMPT_MAX_LENGTH,
  validateGlobalChatCreateWithPromptPrompt,
  type GlobalChatCreatedSessionSummary,
} from "../dist/features/workspace-tools/global-chat-mutation-tools.js";
import { createGlobalChatInspectionWorkspaceTools } from "../dist/features/workspace-tools/global-chat-inspection-tools.js";

const createdSummary = (
  overrides: Partial<GlobalChatCreatedSessionSummary> = {},
): GlobalChatCreatedSessionSummary => ({
  id: "created-session-1",
  title: "Plan the week",
  archived: false,
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  ...overrides,
});

const createTools = (
  overrides: {
    readonly created?: GlobalChatCreatedSessionSummary;
    readonly approved?: boolean;
    readonly createError?: Error;
  } = {},
) => {
  const calls: { commandId: string; firstPrompt: string }[] = [];
  const gateCalls: { callingSessionId: string; toolName: string }[] = [];
  const inspectionTools = createGlobalChatInspectionWorkspaceTools({
    hostKind: "local",
    getWorkspaceSnapshot: async () => ({
      projectCount: 0,
      unarchivedGlobalChatCount: 1,
    }),
    listProjectSummaries: async () => [],
    listGlobalChatSummaries: async () => [],
    getAgentRuntimeDefaults: async () => ({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "low",
    }),
    listAgentModels: async () => [],
  });
  const tools = createGlobalChatMutationWorkspaceTools({
    inspectionTools,
    createSessionWithFirstPrompt: async (input) => {
      calls.push(input);
      if (overrides.createError) throw overrides.createError;
      return overrides.created ?? createdSummary();
    },
    confirmToolCall: async (input) => {
      gateCalls.push({
        callingSessionId: input.callingSessionId,
        toolName: input.toolName,
      });
      return { approved: overrides.approved ?? true };
    },
  });
  return { tools, calls, gateCalls };
};

const confirmedTool = (tools: ReturnType<typeof createTools>["tools"]) => {
  const configuration = tools.turnToolConfiguration({
    callingSessionId: "calling-session-1",
  });
  if (configuration.kind !== "inspectionWithConfirmedMutation")
    throw new Error("expected inspectionWithConfirmedMutation");
  const tool = configuration.confirmedTools[0];
  if (!tool) throw new Error("missing confirmed mutation tool");
  return { configuration, tool };
};

const displayResult = (output: Record<string, unknown>) =>
  ({
    content: [{ type: "text", text: JSON.stringify(output) }],
  }) as AgentToolDisplayResult;

describe("Global Chat createWithPrompt mutation Workspace Tool", () => {
  it("declares exactly one mutation tool with write safety and confirmation-required approval", () => {
    const { tools } = createTools();

    expect(tools.descriptors.map((descriptor) => descriptor.name)).toEqual([
      "globalChats.createWithPrompt",
    ]);
    for (const descriptor of tools.descriptors) {
      expect(descriptor.safety).toBe("write");
      expect(descriptor.confirmation).toBe("ask");
      expect(descriptor.approval).toEqual({
        status: "requires_approval",
        confirmation: "ask",
        source: "default_policy",
        reason: "user_confirmation_required",
      });
      expect(descriptor.scope).toBe("global-chat");
      expect(descriptor.requiresManagedWorktree).toBe(false);
      expect(descriptor.input).toEqual({
        type: "object",
        properties: {
          prompt: { type: "string", minLength: 1, maxLength: 16_000 },
        },
        additionalProperties: false,
      });
      expect(descriptor.output).toEqual({
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          archived: { type: "boolean" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
        additionalProperties: false,
      });
    }
  });

  it("composes the confirmed mutation tool with the unchanged approved read-only set", () => {
    const { tools, gateCalls } = createTools();
    const configuration = tools.turnToolConfiguration({
      callingSessionId: "calling-session-1",
    });

    expect(configuration.kind).toBe("inspectionWithConfirmedMutation");
    if (configuration.kind !== "inspectionWithConfirmedMutation")
      throw new Error("kind");
    expect(configuration.tools.map((tool) => tool.name)).toEqual([
      "workspace.getStatus",
      "projects.listSummaries",
      "globalChats.listSummaries",
      "agentRuntime.getDefaults",
    ]);
    expect(configuration.confirmedTools.map((tool) => tool.name)).toEqual([
      "globalChats.createWithPrompt",
    ]);
    expect(typeof configuration.confirmToolCall).toBe("function");
    expect(gateCalls).toEqual([]);
  });

  it("routes the confirmation gate through the calling session id", async () => {
    const { tools, gateCalls } = createTools({ approved: false });
    const { configuration } = confirmedTool(tools);

    const decision = await configuration.confirmToolCall({
      toolName: "globalChats.createWithPrompt",
      args: { prompt: "Plan the week" },
    });

    expect(decision).toEqual({ approved: false });
    expect(gateCalls).toEqual([
      {
        callingSessionId: "calling-session-1",
        toolName: "globalChats.createWithPrompt",
      },
    ]);
  });

  it("annotates the chat turn policy with write safety and confirmation-required approval", () => {
    const { tools } = createTools();

    expect(tools.chatTurnToolPolicy.listTurnTools().at(-1)).toEqual({
      name: "globalChats.createWithPrompt",
      safety: "write",
    });
    expect(
      tools.chatTurnToolPolicy.approvalForTool("globalChats.createWithPrompt"),
    ).toEqual({
      status: "requires_approval",
      reason: "user_confirmation_required",
    });
    // Read-only inspection tools keep their approved-by-default policy.
    expect(
      tools.chatTurnToolPolicy.approvalForTool("workspace.getStatus"),
    ).toEqual({ status: "approved", reason: "approved_by_default" });
  });

  it("denies Project, worktree, Files, Git, credential, and unknown tools", () => {
    const { tools } = createTools();

    expect(tools.authorizeTool("globalChats.createWithPrompt")).toEqual({
      allowed: true,
    });
    expect(tools.authorizeTool("workspace.getStatus")).toEqual({
      allowed: true,
    });
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
    }
  });

  it("validates the prompt with the same rules as Global Chat first-prompt creation", () => {
    expect(() =>
      validateGlobalChatCreateWithPromptPrompt({ prompt: "" }),
    ).toThrow("prompt must not be blank");
    expect(() =>
      validateGlobalChatCreateWithPromptPrompt({ prompt: "   \n\t  " }),
    ).toThrow("prompt must not be blank");
    expect(() =>
      validateGlobalChatCreateWithPromptPrompt({ prompt: "x".repeat(16_001) }),
    ).toThrow("prompt must not exceed 16000 characters");
    expect(() =>
      validateGlobalChatCreateWithPromptPrompt({ other: "value" }),
    ).toThrow("prompt is required and must be a string");
    expect(
      validateGlobalChatCreateWithPromptPrompt({ prompt: "  Plan the week  " }),
    ).toBe("Plan the week");
    expect(
      validateGlobalChatCreateWithPromptPrompt({ prompt: "x".repeat(16_000) }),
    ).toHaveLength(16_000);
    expect(GLOBAL_CHAT_PROMPT_MAX_LENGTH).toBe(16_000);
    expect(GLOBAL_CHAT_MUTATION_CONFIRMATION_REASON).toBe(
      "user_confirmation_required",
    );
    expect(GLOBAL_CHAT_CREATE_WITH_PROMPT_TOOL_NAME).toBe(
      "globalChats.createWithPrompt",
    );
  });

  it("creates a durable session on an approved call and returns the sanitized summary only", async () => {
    const { tools, calls } = createTools({
      created: createdSummary({
        id: "created-session-7",
        title: "Plan the week",
      }),
    });
    const { tool } = confirmedTool(tools);

    const result = await tool.execute({ prompt: "  Plan the week  " });

    expect(calls).toEqual([
      {
        commandId: expect.any(String),
        firstPrompt: "Plan the week",
      },
    ]);
    expect(calls[0]!.commandId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(result).toEqual({
      id: "created-session-7",
      title: "Plan the week",
      archived: false,
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    });
    // Exactly the five sanitized fields: no route, navigation, transcript,
    // worktree, credential, or Host-internal data.
    expect(Object.keys(result).sort()).toEqual([
      "archived",
      "createdAt",
      "id",
      "title",
      "updatedAt",
    ]);
  });

  it("surfaces sanitized creation failures without exposing Host internals", async () => {
    const { tools } = createTools({
      createError: new Error("agent_default_model_missing"),
    });
    const { tool } = confirmedTool(tools);

    await expect(tool.execute({ prompt: "Plan the week" })).rejects.toThrow(
      "agent_default_model_missing",
    );
  });

  it("includes the created session id in the concise activity summary and never the prompt", () => {
    const { tools } = createTools();

    expect(
      tools.activitySummaryForTool({
        toolName: "globalChats.createWithPrompt",
        outcome: "succeeded",
        result: displayResult({
          id: "created-session-9",
          title: "Plan the week",
        }),
      }),
    ).toBe("Global Chat session created (created-session-9)");
    expect(
      tools.activitySummaryForTool({
        toolName: "globalChats.createWithPrompt",
        outcome: "denied",
      }),
    ).toBe("Global Chat session create");
    expect(
      tools.activitySummaryForTool({
        toolName: "globalChats.createWithPrompt",
        outcome: "failed",
      }),
    ).toBe("Global Chat session create");
    // Non-mutation tools keep the read-only inspection summaries.
    expect(
      tools.activitySummaryForTool({
        toolName: "workspace.getStatus",
        outcome: "succeeded",
      }),
    ).toBe("Workspace status inspected");
  });
});
