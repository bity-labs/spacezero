import { describe, expect, it, vi } from "vitest";
import type {
  AgentRuntimeEvent,
  AgentTurnContentPart,
  AgentTurnMessage,
  ConversationRunner,
} from "@spacezero/pi-adapter";
import {
  createChatTurnRunner,
  type ChatTurnRepository,
} from "./chat-turn-runner.service.js";

interface TestLiveEnvelope {
  readonly live: true;
  readonly eventType: string;
  readonly event: {
    readonly type: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly messageId?: string;
    readonly reason?: string;
  };
}

const sessionId = "session-1";
const commandId = "command-1";
const turnId = "turn-1";
const assistantMessageId = "assistant-message-1";

const waitFor = async (assertion: () => void | Promise<void>) => {
  const deadline = Date.now() + 1_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (lastError) throw lastError;
};

const admission = {
  kind: "admitted" as const,
  turnId,
  userSequence: 1,
  result: {
    turn: {
      id: turnId,
      assistantMessageId,
      assistantMessageIds: [assistantMessageId],
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      thinkingLevel: "off" as const,
    },
  },
};

const createRepository = (
  overrides: Partial<ChatTurnRepository> = {},
): ChatTurnRepository => ({
  listTurnHistoryBefore: vi.fn(
    async (): Promise<readonly AgentTurnMessage[]> => [],
  ),
  checkpointTurnDraft: vi.fn(async () => undefined),
  recordToolStarted: vi.fn(async () => undefined),
  recordToolCompleted: vi.fn(async () => undefined),
  completeTurn: vi.fn(async () => ({ ok: true })),
  failTurn: vi.fn(async () => undefined),
  interruptTurn: vi.fn(async () => ({ ok: true })),
  markTurnRecoveryRequired: vi.fn(async () => undefined),
  ...overrides,
});

const runTurn = async (input: {
  readonly runner: ConversationRunner;
  readonly repository: ChatTurnRepository;
  readonly toolPolicy?: {
    readonly listTurnTools: () => readonly {
      readonly name: string;
      readonly safety?: "read" | "write" | "dangerous";
    }[];
    readonly approvalForTool: (toolName: string) => {
      readonly status?: "approved" | "requires_approval";
      readonly reason?: string;
    };
  };
}) => {
  const turnRunner = createChatTurnRunner<never, TestLiveEnvelope>({
    conversationRunner: input.runner,
  });
  turnRunner.runAdmittedTurn({
    sessionId,
    commandId,
    prompt: "do the work",
    conversationId: sessionId,
    admission,
    repository: input.repository,
    tools: { kind: "none", enabledToolNames: [] },
    toolPolicy: input.toolPolicy ?? {
      listTurnTools: () => [],
      approvalForTool: () => ({}),
    },
    makeAssistantTextDelta: ({ sessionId, turnId, messageId }) => ({
      live: true,
      eventType: "AssistantTextDeltaV1",
      event: { type: "AssistantTextDeltaV1", sessionId, turnId, messageId },
    }),
    makeAssistantReasoningDelta: ({ sessionId, turnId, messageId }) => ({
      live: true,
      eventType: "AssistantReasoningDeltaV1",
      event: {
        type: "AssistantReasoningDeltaV1",
        sessionId,
        turnId,
        messageId,
      },
    }),
    makeToolCallUpdated: ({ sessionId, turnId }) => ({
      live: true,
      eventType: "AgentToolCallUpdatedV1",
      event: { type: "AgentToolCallUpdatedV1", sessionId, turnId },
    }),
    makeConversationPersistenceFailed: ({ sessionId, turnId, messageId }) => ({
      live: true,
      eventType: "ConversationPersistenceFailedV1",
      event: {
        type: "ConversationPersistenceFailedV1",
        sessionId,
        turnId,
        messageId,
        reason: "conversation_persistence_failed",
      },
    }),
  });
  return turnRunner;
};

const events = async (
  turnRunner: ReturnType<typeof createChatTurnRunner<never, TestLiveEnvelope>>,
) =>
  turnRunner.waitForSseAfter(
    sessionId,
    0,
    0,
    async () => [],
    AbortSignal.timeout(50),
  );

describe("chat turn persistence failure path", () => {
  it("reports checkpoint persistence failure, requests cancellation, and does not record a successful completion", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repository = createRepository({
      checkpointTurnDraft: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "assistant_delta",
          part: { type: "text", order: 1, text: "x".repeat(2_048) },
        });
        throw new Error("turn should have been cancelled");
      },
    };

    const turnRunner = await runTurn({ runner, repository });

    await waitFor(() => {
      expect(repository.markTurnRecoveryRequired).toHaveBeenCalledWith({
        sessionId,
        turnId,
      });
    });
    expect(repository.completeTurn).not.toHaveBeenCalled();
    expect(repository.failTurn).not.toHaveBeenCalled();
    expect(turnRunner.hasStorageFault(sessionId)).toBe(true);
    await expect(events(turnRunner)).resolves.toMatchObject({
      envelopes: [
        {
          live: true,
          eventType: "ConversationPersistenceFailedV1",
          event: {
            type: "ConversationPersistenceFailedV1",
            sessionId,
            turnId,
            messageId: assistantMessageId,
            reason: "conversation_persistence_failed",
          },
        },
      ],
    });
    expect(warn).toHaveBeenCalledWith("conversation persistence failed", {
      operation: "checkpointTurnDraft",
      sessionId,
      turnId,
    });
    warn.mockRestore();
  });

  it("treats failed tool-boundary persistence as a recovery fault instead of a successful tool result", async () => {
    const repository = createRepository({
      recordToolCompleted: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "tool_completed",
          toolCallId: "call-1",
          toolName: "read",
          isError: false,
          result: { content: [{ type: "text", text: "secret-free result" }] },
        } satisfies AgentRuntimeEvent);
        return { text: "done" };
      },
    };

    await runTurn({ runner, repository });

    await waitFor(() => {
      expect(repository.markTurnRecoveryRequired).toHaveBeenCalledWith({
        sessionId,
        turnId,
      });
    });
    expect(repository.completeTurn).not.toHaveBeenCalled();
    expect(repository.failTurn).not.toHaveBeenCalled();
  });

  it("surfaces completion persistence failure as recovery-required instead of a completed durable turn", async () => {
    const finalParts: readonly AgentTurnContentPart[] = [
      { type: "text", order: 1, text: "final answer" },
    ];
    const repository = createRepository({
      completeTurn: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const runner: ConversationRunner = {
      submitTurn: async () => ({ text: "final answer", parts: finalParts }),
    };

    const turnRunner = await runTurn({ runner, repository });

    await waitFor(() => {
      expect(repository.markTurnRecoveryRequired).toHaveBeenCalledWith({
        sessionId,
        turnId,
      });
    });
    expect(repository.completeTurn).toHaveBeenCalledWith({
      commandId,
      sessionId,
      turnId,
      text: "final answer",
      parts: finalParts,
      messages: [
        {
          id: assistantMessageId,
          text: "final answer",
          parts: finalParts,
        },
      ],
    });
    expect(repository.failTurn).not.toHaveBeenCalled();
    expect(turnRunner.hasStorageFault(sessionId)).toBe(true);
  });

  it("records tool denial activity without a transcript tool part when a tool call is denied", async () => {
    const repository = createRepository({
      recordToolDenied: vi.fn(async () => undefined),
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "tool_started",
          toolCallId: "call-1",
          toolName: "write",
          arguments: { path: "src/app.ts" },
        } satisfies AgentRuntimeEvent);
        await input.onEvent?.({
          type: "tool_denied",
          toolCallId: "call-1",
          toolName: "write",
          reason: "Tool is not enabled for this Chat Session",
        } satisfies AgentRuntimeEvent);
        return { text: "done" };
      },
    };

    await runTurn({ runner, repository });

    await waitFor(() => {
      expect(repository.recordToolDenied).toHaveBeenCalledWith({
        sessionId,
        turnId,
        toolCallId: "call-1",
        toolName: "write",
        reason: "Tool is not enabled for this Chat Session",
      });
    });
    expect(repository.recordToolCompleted).not.toHaveBeenCalled();
    expect(repository.completeTurn).toHaveBeenCalled();
  });

  it("records the denied tool safety from the chat turn tool policy", async () => {
    const repository = createRepository({
      recordToolDenied: vi.fn(async () => undefined),
    });
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "tool_denied",
          toolCallId: "call-1",
          toolName: "globalChats.createWithPrompt",
          reason: "user_confirmation_required",
        } satisfies AgentRuntimeEvent);
        return { text: "done" };
      },
    };

    await runTurn({
      runner,
      repository,
      toolPolicy: {
        listTurnTools: () => [
          { name: "globalChats.createWithPrompt", safety: "write" },
        ],
        approvalForTool: () => ({
          status: "requires_approval",
          reason: "user_confirmation_required",
        }),
      },
    });

    await waitFor(() => {
      expect(repository.recordToolDenied).toHaveBeenCalledWith({
        sessionId,
        turnId,
        toolCallId: "call-1",
        toolName: "globalChats.createWithPrompt",
        safety: "write",
        reason: "user_confirmation_required",
      });
    });
  });

  it("ignores denial events when the repository does not keep denial activity", async () => {
    const repository = createRepository();
    const runner: ConversationRunner = {
      submitTurn: async (input) => {
        await input.onEvent?.({
          type: "tool_denied",
          toolCallId: "call-1",
          toolName: "write",
          reason: "Tool is not enabled for this Chat Session",
        } satisfies AgentRuntimeEvent);
        return { text: "done" };
      },
    };

    await runTurn({ runner, repository });

    await waitFor(() => {
      expect(repository.completeTurn).toHaveBeenCalled();
    });
  });
});
