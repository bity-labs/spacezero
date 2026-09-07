import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_CHAT_SESSIONS_PAGE_SIZE,
  ListGlobalChatSessionsPageQuerySchema,
  ListGlobalChatSessionsResultSchema,
  CreateGlobalChatSessionWithFirstPromptRequestSchema,
  CreateGlobalChatSessionWithFirstPromptResultSchema,
  GlobalChatSessionEventSchema,
  GlobalChatSessionFollowUpSchema,
  GlobalChatSessionLiveEventEnvelopeSchema,
  GlobalChatSessionMessageSchema,
  GetGlobalChatSessionRuntimeResultSchema,
  GlobalChatSessionRuntimeConfigurationSchema,
  GlobalChatSessionSummarySchema,
  GlobalChatSessionToolCallPartSchema,
  GlobalChatSessionTurnSchema,
  RenameGlobalChatSessionRequestSchema,
  RenameGlobalChatSessionResultSchema,
  UpdateGlobalChatSessionRuntimeRequestSchema,
  UpdateGlobalChatSessionRuntimeResultSchema,
  deriveGlobalChatSessionInitialTitle,
  globalChatSessionTitleProblem,
} from "./global-chat-session.schema.js";
import { GlobalChatSessionRuntimeRevisionConflictErrorSchema } from "./global-chat-session-errors.schema.js";

const parseSync = Schema.decodeUnknownSync;
const uuid = "01234567-89ab-4def-8123-456789abcdef";
const messageId = "11111111-2222-4333-8444-555555555555";
const turnId = "22222222-3333-4444-8555-666666666666";
const assistantMessageId = "33333333-4444-4555-8666-777777777777";

const session = {
  id: uuid,
  title: "Plan the release",
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastSequence: 2,
};

const firstMessage = {
  id: messageId,
  role: "user" as const,
  text: "Plan the release",
  sequence: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  commandId: uuid,
};

const turn = {
  id: turnId,
  commandId: uuid,
  state: "running" as const,
  userMessageId: messageId,
  assistantMessageId,
  assistantMessageIds: [assistantMessageId],
  providerId: "anthropic",
  modelId: "claude-sonnet-4-5",
  thinkingLevel: "off" as const,
  draftText: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Global Chat Session schemas", () => {
  it("accepts a create-with-first-prompt command and returns a durable unarchived session plus first message", () => {
    expect(
      parseSync(CreateGlobalChatSessionWithFirstPromptRequestSchema)({
        commandId: uuid,
        firstPrompt: "Plan the release",
      }),
    ).toEqual({ commandId: uuid, firstPrompt: "Plan the release" });

    expect(
      parseSync(CreateGlobalChatSessionWithFirstPromptResultSchema)({
        session,
        turn,
        userMessage: firstMessage,
        firstMessage,
      }),
    ).toEqual({ session, turn, userMessage: firstMessage, firstMessage });
  });

  it("rejects blank or oversized first prompts", () => {
    expect(() =>
      parseSync(CreateGlobalChatSessionWithFirstPromptRequestSchema)({
        commandId: uuid,
        firstPrompt: "  \n\t ",
      }),
    ).toThrow();
    expect(() =>
      parseSync(CreateGlobalChatSessionWithFirstPromptRequestSchema)({
        commandId: uuid,
        firstPrompt: "x".repeat(16_001),
      }),
    ).toThrow();
  });

  it("keeps Global Chat Session summaries free of Project, worktree, Git, and source identity", () => {
    const parsed = parseSync(GlobalChatSessionSummarySchema)({
      ...session,
      projectId: uuid,
      managedBranch: "spacezero/branch",
      sourceCommit: "a".repeat(40),
      worktreePath: "/tmp/worktree",
    });

    expect(parsed).toEqual(session);
    expect(parsed).not.toHaveProperty("projectId");
    expect(parsed).not.toHaveProperty("managedBranch");
    expect(parsed).not.toHaveProperty("sourceCommit");
    expect(parsed).not.toHaveProperty("worktreePath");
  });

  it("models durable archive state and archive time on Global Chat Session summaries", () => {
    expect(parseSync(GlobalChatSessionSummarySchema)(session)).toEqual(session);
    const archived = parseSync(GlobalChatSessionSummarySchema)({
      ...session,
      archived: true,
      archivedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(archived).toEqual({
      ...session,
      archived: true,
      archivedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(() =>
      parseSync(GlobalChatSessionSummarySchema)({
        ...session,
        archivedAt: "not-a-timestamp",
      }),
    ).toThrow();
  });

  it("derives the initial title from the trimmed first line with deterministic 60-character truncation", () => {
    expect(
      deriveGlobalChatSessionInitialTitle("  First line  \nsecond line"),
    ).toBe("First line");
    expect(
      deriveGlobalChatSessionInitialTitle(
        `  ${"a".repeat(61)}\nignored second line`,
      ),
    ).toBe("a".repeat(60));
    expect(deriveGlobalChatSessionInitialTitle("🧪".repeat(61))).toBe(
      "🧪".repeat(60),
    );
  });

  it("models the persisted first user message", () => {
    expect(parseSync(GlobalChatSessionMessageSchema)(firstMessage)).toEqual(
      firstMessage,
    );
    expect(() =>
      parseSync(GlobalChatSessionMessageSchema)({
        ...firstMessage,
        role: "tool",
      }),
    ).toThrow();
  });

  it("accepts safe global-chat tool parts without unsupported result metadata", () => {
    expect(
      parseSync(GlobalChatSessionToolCallPartSchema)({
        id: `${assistantMessageId}:tool-call:call-1`,
        type: "tool-call",
        order: 1,
        turnId,
        toolCallId: "call-1",
        toolName: "workspace.inspect",
        status: "failed",
        arguments: { target: "sidebar" },
        result: {
          content: [
            { type: "image", mimeType: "image/webp", data: "UklGRg==" },
            {
              type: "unsupported",
              label: "Unsupported tool result content type: html.",
            },
          ],
        },
      }),
    ).toMatchObject({ toolName: "workspace.inspect", status: "failed" });
    expect(() =>
      parseSync(GlobalChatSessionToolCallPartSchema)({
        id: `${assistantMessageId}:tool-call:call-1`,
        type: "tool-call",
        order: 1,
        turnId,
        toolCallId: "call-1",
        toolName: "workspace.inspect",
        status: "failed",
        result: { rawProviderObject: { private: true } },
      }),
    ).toThrow();
    expect(() =>
      parseSync(GlobalChatSessionToolCallPartSchema)({
        id: `${assistantMessageId}:tool-call:call-1`,
        type: "tool-call",
        order: 1,
        turnId,
        toolCallId: "call-1",
        toolName: "workspace.inspect",
        status: "failed",
        result: {
          content: [
            { type: "image", mimeType: "image/svg+xml", data: "PHN2Zy8+" },
          ],
        },
      }),
    ).toThrow();
  });

  it("models live storage persistence failures without protected payloads", () => {
    const envelope = {
      live: true as const,
      eventType: "GlobalChatConversationPersistenceFailedV1",
      event: {
        type: "GlobalChatConversationPersistenceFailedV1" as const,
        version: 1 as const,
        sessionId: session.id,
        turnId,
        messageId: assistantMessageId,
        reason: "conversation_persistence_failed" as const,
        timestamp: "2026-01-01T00:02:00.000Z",
      },
    };

    expect(
      parseSync(GlobalChatSessionLiveEventEnvelopeSchema)(envelope),
    ).toEqual(envelope);
  });

  it("models Global Chat follow-ups and durable queue lifecycle events", () => {
    const followUp = {
      id: "44444444-5555-4666-8777-888888888888",
      commandId: uuid,
      sessionId: session.id,
      prompt: "Follow up next",
      state: "queued" as const,
      position: 1,
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    };
    expect(parseSync(GlobalChatSessionFollowUpSchema)(followUp)).toEqual(
      followUp,
    );
    expect(
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionFollowUpQueuedV1",
        version: 1,
        sessionId: session.id,
        followUpId: followUp.id,
        commandId: uuid,
        prompt: "Follow up next",
        position: 1,
        timestamp: "2026-01-01T00:01:00.000Z",
      }),
    ).toMatchObject({ type: "GlobalChatSessionFollowUpQueuedV1" });
    expect(
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionFollowUpConsumedV1",
        version: 1,
        sessionId: session.id,
        followUpId: followUp.id,
        commandId: uuid,
        turnId,
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({ type: "GlobalChatSessionFollowUpConsumedV1", turnId });
  });

  it("models durable archive and unarchive lifecycle events", () => {
    expect(
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionArchivedV1",
        version: 1,
        sessionId: session.id,
        commandId: uuid,
        timestamp: "2026-01-02T03:04:05.000Z",
      }),
    ).toMatchObject({ type: "GlobalChatSessionArchivedV1" });
    expect(
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionUnarchivedV1",
        version: 1,
        sessionId: session.id,
        commandId: uuid,
        timestamp: "2026-01-02T03:04:06.000Z",
      }),
    ).toMatchObject({ type: "GlobalChatSessionUnarchivedV1" });
    expect(() =>
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionArchivedV1",
        version: 1,
        sessionId: session.id,
        timestamp: "2026-01-02T03:04:05.000Z",
      }),
    ).toThrow();
  });

  it("models rename commands, results, and durable rename events", () => {
    expect(
      parseSync(RenameGlobalChatSessionRequestSchema)({
        commandId: uuid,
        title: "  Renamed chat  ",
      }),
    ).toEqual({ commandId: uuid, title: "  Renamed chat  " });
    expect(parseSync(RenameGlobalChatSessionResultSchema)({ session })).toEqual(
      { session },
    );
    expect(
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionRenamedV1",
        version: 1,
        sessionId: session.id,
        commandId: uuid,
        title: "Renamed chat",
        timestamp: "2026-01-02T03:04:07.000Z",
      }),
    ).toMatchObject({
      type: "GlobalChatSessionRenamedV1",
      title: "Renamed chat",
    });
    expect(() =>
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionRenamedV1",
        version: 1,
        sessionId: session.id,
        commandId: uuid,
        title: "",
        timestamp: "2026-01-02T03:04:07.000Z",
      }),
    ).toThrow();
  });

  it("validates rename titles as trimmed, single-line, at most 120 code points", () => {
    expect(globalChatSessionTitleProblem("  Renamed chat  ")).toBeUndefined();
    expect(globalChatSessionTitleProblem("  \n\t ")).toMatchObject({
      problem: "blank",
      trimmed: "",
    });
    expect(globalChatSessionTitleProblem("two\nlines")).toMatchObject({
      problem: "multi_line",
      trimmed: "two\nlines",
    });
    expect(globalChatSessionTitleProblem("x".repeat(120))).toBeUndefined();
    expect(globalChatSessionTitleProblem("x".repeat(121))).toMatchObject({
      problem: "too_long",
    });
    // Astral-plane code points count as one character, not two UTF-16 units:
    // 120 emoji (240 UTF-16 units) must be accepted, 121 rejected.
    expect(globalChatSessionTitleProblem("🧪".repeat(120))).toBeUndefined();
    expect(globalChatSessionTitleProblem("🧪".repeat(121))).toMatchObject({
      problem: "too_long",
    });
    expect(
      globalChatSessionTitleProblem("a".repeat(119) + "\u00e9"),
    ).toBeUndefined();
    expect(
      globalChatSessionTitleProblem("a".repeat(120) + "\u00e9"),
    ).toMatchObject({
      problem: "too_long",
    });
  });

  it("accepts 120 astral-plane code point titles and round-trips them through the wire", () => {
    const astralTitle = "🧪".repeat(120);
    expect([...astralTitle].length).toBe(120);
    expect(astralTitle.length).toBe(240);

    const renameRequest = parseSync(RenameGlobalChatSessionRequestSchema)({
      commandId: uuid,
      title: astralTitle,
    });
    expect(renameRequest.title).toBe(astralTitle);
    // Round-trip through the JSON wire encoding must not lose the title or
    // fail schema validation on read-back.
    expect(
      parseSync(RenameGlobalChatSessionRequestSchema)(
        JSON.parse(JSON.stringify(renameRequest)),
      ),
    ).toEqual(renameRequest);

    const summary = parseSync(GlobalChatSessionSummarySchema)({
      ...session,
      title: astralTitle,
    });
    expect(summary.title).toBe(astralTitle);
    expect(
      parseSync(GlobalChatSessionSummarySchema)(
        JSON.parse(JSON.stringify(summary)),
      ).title,
    ).toBe(astralTitle);

    const renamedEvent = parseSync(GlobalChatSessionEventSchema)({
      type: "GlobalChatSessionRenamedV1",
      version: 1,
      sessionId: session.id,
      commandId: uuid,
      title: astralTitle,
      timestamp: "2026-01-02T03:04:07.000Z",
    });
    expect(renamedEvent).toMatchObject({ title: astralTitle });
    expect(
      parseSync(GlobalChatSessionEventSchema)(
        JSON.parse(JSON.stringify(renamedEvent)),
      ),
    ).toEqual(renamedEvent);
  });

  it("rejects titles beyond 120 code points even when they fit UTF-16 heuristics", () => {
    expect(() =>
      parseSync(GlobalChatSessionSummarySchema)({
        ...session,
        title: "x".repeat(121),
      }),
    ).toThrow();
    expect(() =>
      parseSync(GlobalChatSessionSummarySchema)({
        ...session,
        title: "🧪".repeat(121),
      }),
    ).toThrow();
    expect(() =>
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatSessionRenamedV1",
        version: 1,
        sessionId: session.id,
        commandId: uuid,
        title: "🧪".repeat(121),
        timestamp: "2026-01-02T03:04:07.000Z",
      }),
    ).toThrow();
  });

  it("accepts reasoning-only in-progress checkpoints", () => {
    expect(
      parseSync(GlobalChatSessionEventSchema)({
        type: "GlobalChatAgentMessageCheckpointedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        messageId: assistantMessageId,
        text: "",
        parts: [
          {
            id: `${assistantMessageId}:reasoning:1`,
            type: "reasoning",
            order: 1,
            text: "Plan before answering.",
            turnId,
          },
        ],
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({
      type: "GlobalChatAgentMessageCheckpointedV1",
      text: "",
      parts: [{ type: "reasoning", text: "Plan before answering." }],
    });
  });

  it("models session runtime configuration as sanitized provider/model/thinking descriptors", () => {
    const runtime = {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "high" as const,
      revision: 2,
    };

    expect(
      parseSync(GlobalChatSessionRuntimeConfigurationSchema)(runtime),
    ).toEqual(runtime);

    // Rejected descriptors: non-positive revisions and unknown thinking levels.
    expect(() =>
      parseSync(GlobalChatSessionRuntimeConfigurationSchema)({
        ...runtime,
        revision: 0,
      }),
    ).toThrow();
    expect(() =>
      parseSync(GlobalChatSessionRuntimeConfigurationSchema)({
        ...runtime,
        defaultThinkingLevel: "extreme",
      }),
    ).toThrow();
  });

  it("keeps runtime configuration free of credentials, auth paths, provider headers, and Pi internals", () => {
    const parsed = parseSync(GlobalChatSessionRuntimeConfigurationSchema)({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "off",
      revision: 1,
      apiKey: "sk-secret",
      authStoragePath: "/home/user/.pi/auth",
      providerHeaders: { authorization: "Bearer sk-secret" },
      piModelRecord: { id: "raw-pi-model", contextWindow: 200000 },
      projectId: uuid,
      managedBranch: "spacezero/branch",
      worktreePath: "/tmp/worktree",
    });

    expect(parsed).toEqual({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "off",
      revision: 1,
    });
    expect(parsed).not.toHaveProperty("apiKey");
    expect(parsed).not.toHaveProperty("authStoragePath");
    expect(parsed).not.toHaveProperty("providerHeaders");
    expect(parsed).not.toHaveProperty("piModelRecord");
    expect(parsed).not.toHaveProperty("projectId");
    expect(parsed).not.toHaveProperty("managedBranch");
    expect(parsed).not.toHaveProperty("worktreePath");
  });

  it("requires a command ID and expected revision for runtime updates", () => {
    const request = {
      commandId: uuid,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "high" as const,
      expectedRevision: 1,
    };

    expect(
      parseSync(UpdateGlobalChatSessionRuntimeRequestSchema)(request),
    ).toEqual(request);
    expect(() =>
      parseSync(UpdateGlobalChatSessionRuntimeRequestSchema)({
        ...request,
        expectedRevision: 0,
      }),
    ).toThrow();
    const requestWithoutRevision = {
      commandId: request.commandId,
      providerId: request.providerId,
      modelId: request.modelId,
      defaultThinkingLevel: request.defaultThinkingLevel,
    };
    expect(() =>
      parseSync(UpdateGlobalChatSessionRuntimeRequestSchema)(
        requestWithoutRevision,
      ),
    ).toThrow();
  });

  it("models runtime reads and updates as session plus sanitized runtime results", () => {
    const runtime = {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "high" as const,
      revision: 2,
    };

    expect(
      parseSync(GetGlobalChatSessionRuntimeResultSchema)({ session, runtime }),
    ).toEqual({ session, runtime });
    expect(
      parseSync(UpdateGlobalChatSessionRuntimeResultSchema)({
        session,
        runtime: { ...runtime, revision: 3 },
      }),
    ).toEqual({ session, runtime: { ...runtime, revision: 3 } });
  });

  it("snapshots effective provider, model, and thinking level on admitted Global Chat turns", () => {
    const parsed = parseSync(GlobalChatSessionTurnSchema)({
      ...turn,
      state: "completed" as const,
      apiKey: "sk-secret",
      providerHeaders: { authorization: "Bearer sk-secret" },
    });

    expect(parsed).toEqual({ ...turn, state: "completed" });
    expect(parsed).toHaveProperty("providerId", "anthropic");
    expect(parsed).toHaveProperty("modelId", "claude-sonnet-4-5");
    expect(parsed).toHaveProperty("thinkingLevel", "off");
    expect(parsed).not.toHaveProperty("apiKey");
    expect(parsed).not.toHaveProperty("providerHeaders");
  });

  it("models runtime revision conflicts as typed public errors", () => {
    const body = {
      code: "global_chat_session_runtime_revision_conflict" as const,
      message:
        "This Global Chat Session runtime configuration changed. Reload and try again.",
    };

    expect(
      parseSync(GlobalChatSessionRuntimeRevisionConflictErrorSchema)(body),
    ).toEqual(body);
    expect(() =>
      parseSync(GlobalChatSessionRuntimeRevisionConflictErrorSchema)({
        code: "global_chat_session_archived",
        message: "Not a revision conflict.",
      }),
    ).toThrow();
  });
});

describe("Global Chat Session batched list page", () => {
  it("exposes the required 20-per-page default page size", () => {
    expect(GLOBAL_CHAT_SESSIONS_PAGE_SIZE).toBe(20);
  });

  it("accepts a paged list query without parameters", () => {
    expect(parseSync(ListGlobalChatSessionsPageQuerySchema)({})).toEqual({});
  });

  it("decodes the paged list query from URL query strings", () => {
    expect(
      parseSync(ListGlobalChatSessionsPageQuerySchema)({
        archived: "true",
        limit: "20",
        offset: "40",
      }),
    ).toEqual({ archived: true, limit: 20, offset: 40 });
  });

  it("round-trips the archived flag through the wire encoding", () => {
    const decoded = parseSync(ListGlobalChatSessionsPageQuerySchema)({
      archived: "false",
    });
    expect(decoded).toEqual({ archived: false });
    expect(
      Schema.encodeSync(ListGlobalChatSessionsPageQuerySchema)(decoded),
    ).toEqual({ archived: "false" });
  });

  it("rejects invalid paged list query parameters", () => {
    expect(() =>
      parseSync(ListGlobalChatSessionsPageQuerySchema)({ limit: "0" }),
    ).toThrow();
    expect(() =>
      parseSync(ListGlobalChatSessionsPageQuerySchema)({ limit: "101" }),
    ).toThrow();
    expect(() =>
      parseSync(ListGlobalChatSessionsPageQuerySchema)({ limit: "many" }),
    ).toThrow();
    expect(() =>
      parseSync(ListGlobalChatSessionsPageQuerySchema)({ offset: "-1" }),
    ).toThrow();
    expect(() =>
      parseSync(ListGlobalChatSessionsPageQuerySchema)({ archived: "yes" }),
    ).toThrow();
  });

  it("accepts batched summaries with a sanitized last-message preview and continuation state", () => {
    const archivedSummary = {
      ...session,
      archived: true,
      archivedAt: "2026-01-02T00:00:00.000Z",
      lastMessagePreview: "Global answer.",
    };
    const parsed = parseSync(ListGlobalChatSessionsResultSchema)({
      sessions: [archivedSummary, session],
      pageInfo: { pageSize: 2, hasMore: false },
    });

    expect(parsed.sessions).toHaveLength(2);
    expect(parsed.sessions[0]).toMatchObject({
      id: uuid,
      archived: true,
      lastMessagePreview: "Global answer.",
    });
    // Summaries without a last message stay preview-less.
    expect(parsed.sessions[1]).not.toHaveProperty("lastMessagePreview");
    expect(parsed.pageInfo).toEqual({ pageSize: 2, hasMore: false });
  });

  it("keeps the legacy full-list result valid without pagination state", () => {
    const parsed = parseSync(ListGlobalChatSessionsResultSchema)({
      sessions: [session],
    });

    expect(parsed.sessions).toEqual([session]);
    expect(parsed).not.toHaveProperty("pageInfo");
  });

  it("rejects malformed previews and continuation state", () => {
    expect(() =>
      parseSync(ListGlobalChatSessionsResultSchema)({
        sessions: [{ ...session, lastMessagePreview: { text: "structured" } }],
      }),
    ).toThrow();
    expect(() =>
      parseSync(ListGlobalChatSessionsResultSchema)({
        sessions: [session],
        pageInfo: { pageSize: -1, hasMore: false },
      }),
    ).toThrow();
    expect(() =>
      parseSync(ListGlobalChatSessionsResultSchema)({
        sessions: [session],
        pageInfo: { pageSize: 1, hasMore: "no" },
      }),
    ).toThrow();
    expect(() =>
      parseSync(ListGlobalChatSessionsResultSchema)({
        sessions: [session],
        pageInfo: { pageSize: 1, hasMore: false, nextOffset: -20 },
      }),
    ).toThrow();
  });
});
