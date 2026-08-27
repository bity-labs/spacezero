import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CreateProjectSessionRequestSchema,
  GetProjectSessionRuntimeResultSchema,
  ListSessionMessagesResultSchema,
  ProjectSessionEventEnvelopeSchema,
  ProjectSessionEventSchema,
  ProjectSessionLiveEventEnvelopeSchema,
  ProjectSessionEventStreamQuerySchema,
  ProjectSessionNameSchema,
  ProjectSessionSummarySchema,
  parseProjectSessionEventEnvelope,
  parseProjectSessionEventStreamQuery,
  parseProjectSessionLiveEventEnvelope,
  SessionMessageSchema,
  SubmitSessionPromptRequestSchema,
  SubmitSessionPromptResultSchema,
  UpdateProjectSessionRuntimeRequestSchema,
} from "./project-session.schema.js";

const parseSync = Schema.decodeUnknownSync;
const uuid = "01234567-89ab-4def-8123-456789abcdef";
const messageId = "11111111-2222-4333-8444-555555555555";
const turnId = "99999999-8888-4777-8666-555544443333";
const commit = "a".repeat(40);

const readySession = {
  id: uuid,
  projectId: uuid,
  name: "saint-emilion",
  state: "ready" as const,
  sourceBranch: "main",
  sourceDetached: false,
  sourceCommit: commit,
  uncommittedChangesExcluded: true,
  managedBranch: `spacezero/saint-emilion-${uuid}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:01:00.000Z",
  lastSequence: 6,
};

describe("Project Session schemas", () => {
  it("accepts UUID commands, permanent kebab-case names, and public summaries", () => {
    expect(
      parseSync(CreateProjectSessionRequestSchema)({
        commandId: uuid,
        projectId: uuid,
      }),
    ).toEqual({ commandId: uuid, projectId: uuid });
    expect(parseSync(ProjectSessionNameSchema)("saint-emilion")).toBe(
      "saint-emilion",
    );
    expect(
      parseSync(ProjectSessionSummarySchema)({
        id: uuid,
        projectId: uuid,
        name: "saint-emilion",
        state: "ready",
        sourceBranch: "main",
        sourceDetached: false,
        sourceCommit: commit,
        uncommittedChangesExcluded: true,
        managedBranch: `spacezero/saint-emilion-${uuid}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSequence: 4,
      }),
    ).toMatchObject({ name: "saint-emilion", state: "ready" });
  });

  it("accepts a prompt command and rejects blank or oversized prompts", () => {
    expect(
      parseSync(SubmitSessionPromptRequestSchema)({
        commandId: uuid,
        prompt: "Build the wine list view",
      }),
    ).toEqual({ commandId: uuid, prompt: "Build the wine list view" });
    expect(() =>
      parseSync(SubmitSessionPromptRequestSchema)({
        commandId: uuid,
        prompt: "   \n\t ",
      }),
    ).toThrow();
    expect(() =>
      parseSync(SubmitSessionPromptRequestSchema)({
        commandId: uuid,
        prompt: "x".repeat(16_001),
      }),
    ).toThrow();
  });

  it("models durable Session message boundaries", () => {
    expect(
      parseSync(SessionMessageSchema)({
        id: messageId,
        role: "user",
        text: "Build the wine list view",
        sequence: 5,
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ).toMatchObject({ role: "user", sequence: 5 });
    expect(() =>
      parseSync(SessionMessageSchema)({
        id: messageId,
        role: "tool",
        text: "x",
        sequence: 5,
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      parseSync(SessionMessageSchema)({
        id: messageId,
        role: "assistant",
        text: "",
        sequence: 5,
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ).toThrow();
  });

  it("returns admitted prompt results with turn state and the user message", () => {
    const userMessage = {
      id: messageId,
      role: "user" as const,
      text: "Build the wine list view",
      sequence: 5,
      createdAt: "2026-01-01T00:01:00.000Z",
    };
    const agentMessage = {
      id: turnId,
      role: "assistant" as const,
      text: "Echo: Build the wine list view",
      sequence: 7,
      createdAt: "2026-01-01T00:01:01.000Z",
    };
    const turn = {
      id: turnId,
      commandId: uuid,
      state: "running" as const,
      userMessageId: messageId,
      assistantMessageId: turnId,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      thinkingLevel: "off" as const,
      draftText: "",
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    };
    expect(
      parseSync(SubmitSessionPromptResultSchema)({
        session: readySession,
        turn,
        userMessage,
      }),
    ).toMatchObject({ userMessage, turn });
    expect(
      parseSync(ListSessionMessagesResultSchema)({
        session: readySession,
        messages: [userMessage, agentMessage],
        activeTurn: turn,
        latestTurn: turn,
      }),
    ).toMatchObject({
      messages: [userMessage, agentMessage],
      activeTurn: turn,
      latestTurn: turn,
    });
  });

  it("keeps public provisioning events free of private Host filesystem identity", () => {
    const creation = parseSync(ProjectSessionEventSchema)({
      type: "ProjectSessionCreationRequestedV1",
      version: 1,
      sessionId: uuid,
      projectId: uuid,
      name: "saint-emilion",
      hostId: "22222222-2222-4333-8444-555555555555",
      sourceBranch: "main",
      sourceDetached: false,
      sourceCommit: commit,
      uncommittedChangesExcluded: true,
      managedBranch: `spacezero/saint-emilion-${uuid}`,
      worktreePath: "/tmp/private/SpaceZero/worktrees/project/session",
      worktreeRoot: "/tmp/private/SpaceZero/worktrees/project",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(creation).not.toHaveProperty("hostId");
    expect(creation).not.toHaveProperty("worktreePath");
    expect(creation).not.toHaveProperty("worktreeRoot");

    const prepared = parseSync(ProjectSessionEventSchema)({
      type: "SessionWorkspacePreparedV1",
      version: 1,
      sessionId: uuid,
      canonicalWorktreePath: "/tmp/private/worktree",
      canonicalGitDirPath: "/tmp/private/worktree/.git",
      canonicalGitCommonDirPath: "/tmp/private/repo/.git/worktrees/session",
      worktreeDeviceId: "dev-1",
      worktreeFileId: "file-1",
      gitDirDeviceId: "dev-2",
      gitDirFileId: "file-2",
      commonDirDeviceId: "dev-3",
      commonDirFileId: "file-3",
      timestamp: "2026-01-01T00:00:01.000Z",
    });
    expect(prepared).not.toHaveProperty("canonicalWorktreePath");
    expect(prepared).not.toHaveProperty("canonicalGitDirPath");
    expect(prepared).not.toHaveProperty("canonicalGitCommonDirPath");
    expect(JSON.stringify(prepared)).not.toMatch(/DeviceId|FileId/);
  });

  it("models Session runtime configuration and updates", () => {
    const runtime = {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "off" as const,
      revision: 1,
    };
    expect(
      parseSync(GetProjectSessionRuntimeResultSchema)({
        session: readySession,
        runtime,
      }),
    ).toEqual({ session: readySession, runtime });
    expect(
      parseSync(UpdateProjectSessionRuntimeRequestSchema)({
        commandId: uuid,
        providerId: "anthropic",
        modelId: "claude-opus-4-1",
        defaultThinkingLevel: "high",
        expectedRevision: 1,
      }),
    ).toMatchObject({ modelId: "claude-opus-4-1" });
    expect(() =>
      parseSync(UpdateProjectSessionRuntimeRequestSchema)({
        commandId: uuid,
        providerId: "anthropic",
        modelId: "claude-opus-4-1",
        defaultThinkingLevel: "secret",
        expectedRevision: 1,
      }),
    ).toThrow();
  });

  it("defines prompt and agent-turn journal events", () => {
    expect(
      parseSync(ProjectSessionEventSchema)({
        type: "UserMessageSubmittedV1",
        version: 1,
        sessionId: uuid,
        messageId,
        commandId: uuid,
        prompt: "Build the wine list view",
        timestamp: "2026-01-01T00:01:00.000Z",
      }),
    ).toMatchObject({ type: "UserMessageSubmittedV1" });
    expect(
      parseSync(ProjectSessionEventSchema)({
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        messageId,
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        thinkingLevel: "off",
        timestamp: "2026-01-01T00:01:00.000Z",
      }),
    ).toMatchObject({ type: "AgentTurnStartedV1" });
    expect(
      parseSync(ProjectSessionEventSchema)({
        type: "AgentMessageCheckpointedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        messageId: turnId,
        text: "Partial draft",
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({ type: "AgentMessageCheckpointedV1" });
    expect(
      parseSync(ProjectSessionEventSchema)({
        type: "AgentMessageCompletedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        messageId: turnId,
        text: "Echo: Build the wine list view",
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({ type: "AgentMessageCompletedV1" });
    expect(
      parseSync(ProjectSessionEventSchema)({
        type: "AgentTurnFailedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        reason: "provider_error",
        failureCategory: "provider",
        retryable: false,
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({
      type: "AgentTurnFailedV1",
      failureCategory: "provider",
      retryable: false,
    });
    expect(
      parseSync(ProjectSessionEventSchema)({
        type: "AgentTurnInterruptedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        reason: "user_interrupted",
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({ type: "AgentTurnInterruptedV1" });
    expect(
      parseSync(ProjectSessionEventSchema)({
        type: "AgentToolCallStartedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        toolCallId: "tool-1",
        toolName: "read",
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({ type: "AgentToolCallStartedV1" });
    expect(() =>
      parseSync(ProjectSessionEventSchema)({
        type: "AgentTurnFailedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        reason: "unknown_reason",
        retryable: false,
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toThrow();
  });

  it("models replayable event stream cursors and envelopes", () => {
    expect(
      parseSync(ProjectSessionEventStreamQuerySchema)({ after: "0" }),
    ).toEqual({ after: 0 });
    expect(parseProjectSessionEventStreamQuery({ after: "12" })).toEqual({
      after: 12,
    });
    expect(() =>
      parseProjectSessionEventStreamQuery({ after: "-1" }),
    ).toThrow();
    const envelope = {
      sequence: 5,
      eventType: "UserMessageSubmittedV1",
      event: {
        type: "UserMessageSubmittedV1" as const,
        version: 1 as const,
        sessionId: uuid,
        messageId,
        commandId: uuid,
        prompt: "Build the wine list view",
        timestamp: "2026-01-01T00:01:00.000Z",
      },
    };
    expect(parseSync(ProjectSessionEventEnvelopeSchema)(envelope)).toEqual(
      envelope,
    );
    expect(parseProjectSessionEventEnvelope(envelope)).toEqual(envelope);
    expect(() =>
      parseProjectSessionEventEnvelope({ ...envelope, eventType: "wrong" }),
    ).toThrow();
    const liveEnvelope = {
      live: true as const,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1" as const,
        version: 1 as const,
        sessionId: uuid,
        turnId,
        messageId,
        text: "partial",
        timestamp: "2026-01-01T00:01:00.000Z",
      },
    };
    expect(
      parseSync(ProjectSessionLiveEventEnvelopeSchema)(liveEnvelope),
    ).toEqual(liveEnvelope);
    expect(parseProjectSessionLiveEventEnvelope(liveEnvelope)).toEqual(
      liveEnvelope,
    );
  });

  it("rejects accents, spaces, path-like values, and invalid commits", () => {
    expect(() =>
      parseSync(ProjectSessionNameSchema)("Saint Émilion"),
    ).toThrow();
    expect(() =>
      parseSync(ProjectSessionNameSchema)("saint/emilion"),
    ).toThrow();
    expect(() =>
      parseSync(ProjectSessionSummarySchema)({
        id: uuid,
        projectId: uuid,
        name: "margaux",
        state: "ready",
        sourceBranch: null,
        sourceDetached: true,
        sourceCommit: "z".repeat(40),
        uncommittedChangesExcluded: false,
        managedBranch: `spacezero/margaux-${uuid}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSequence: 1,
      }),
    ).toThrow();
  });
});
