import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CreateGlobalChatSessionWithFirstPromptRequestSchema,
  CreateGlobalChatSessionWithFirstPromptResultSchema,
  GlobalChatSessionEventSchema,
  GlobalChatSessionFollowUpSchema,
  GlobalChatSessionLiveEventEnvelopeSchema,
  GlobalChatSessionMessageSchema,
  GlobalChatSessionSummarySchema,
  GlobalChatSessionToolCallPartSchema,
  deriveGlobalChatSessionInitialTitle,
} from "./global-chat-session.schema.js";

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
});
