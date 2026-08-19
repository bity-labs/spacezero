import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  CreateProjectSessionRequestSchema,
  ListSessionMessagesResultSchema,
  ProjectSessionEventSchema,
  ProjectSessionNameSchema,
  ProjectSessionSummarySchema,
  SessionMessageSchema,
  SubmitSessionPromptRequestSchema,
  SubmitSessionPromptResultSchema,
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

  it("returns the submitted prompt result with both message boundaries", () => {
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
    expect(
      parseSync(SubmitSessionPromptResultSchema)({
        session: readySession,
        userMessage,
        agentMessage,
      }),
    ).toMatchObject({ userMessage, agentMessage });
    expect(
      parseSync(ListSessionMessagesResultSchema)({
        session: readySession,
        messages: [userMessage, agentMessage],
      }),
    ).toMatchObject({ messages: [userMessage, agentMessage] });
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
        timestamp: "2026-01-01T00:01:00.000Z",
      }),
    ).toMatchObject({ type: "AgentTurnStartedV1" });
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
        reason: "agent_turn_failed",
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toMatchObject({ type: "AgentTurnFailedV1" });
    expect(() =>
      parseSync(ProjectSessionEventSchema)({
        type: "AgentTurnFailedV1",
        version: 1,
        sessionId: uuid,
        turnId,
        reason: "unknown_reason",
        timestamp: "2026-01-01T00:01:01.000Z",
      }),
    ).toThrow();
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
