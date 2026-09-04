import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CreateGlobalChatSessionWithFirstPromptRequestSchema,
  CreateGlobalChatSessionWithFirstPromptResultSchema,
  GlobalChatSessionMessageSchema,
  GlobalChatSessionSummarySchema,
  deriveGlobalChatSessionInitialTitle,
} from "./global-chat-session.schema.js";

const parseSync = Schema.decodeUnknownSync;
const uuid = "01234567-89ab-4def-8123-456789abcdef";
const messageId = "11111111-2222-4333-8444-555555555555";

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
        firstMessage,
      }),
    ).toEqual({ session, firstMessage });
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
    expect(deriveGlobalChatSessionInitialTitle("  First line  \nsecond line")).toBe(
      "First line",
    );
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
});
