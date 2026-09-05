import { describe, expect, it, vi } from "vitest";
import {
  AgentTurnError,
  type AgentTurnDelta,
  type AgentTurnInput,
} from "./conversation.model.js";
import { createScriptedConversationRunner } from "./scripted-conversation.adapter.js";

const input = (overrides: Partial<AgentTurnInput> = {}): AgentTurnInput => ({
  sessionId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  history: [],
  tools: {
    kind: "managedWorktree",
    workingDirectory: "/spacezero/worktrees/project/session",
    enabledToolNames: ["read", "write", "edit"],
  },
  runtime: {
    providerId: "faux",
    modelId: "faux-1",
    thinkingLevel: "off",
  },
  prompt: "Build the wine list view",
  ...overrides,
});

describe("scripted conversation runner", () => {
  it("echoes the prompt by default so Host flows stay deterministic", async () => {
    const runner = createScriptedConversationRunner();
    await expect(runner.submitTurn(input())).resolves.toMatchObject({
      text: "Echo: Build the wine list view",
    });
  });

  it("passes the authenticated worktree tool context and prompt to the script", async () => {
    const seen: AgentTurnInput[] = [];
    const runner = createScriptedConversationRunner({
      respond: (turn) => {
        seen.push(turn);
        return "done";
      },
    });
    await runner.submitTurn(input());
    expect(seen).toHaveLength(1);
    expect(seen[0]?.tools).toMatchObject({
      kind: "managedWorktree",
      workingDirectory: "/spacezero/worktrees/project/session",
    });
    expect(seen[0]?.prompt).toBe("Build the wine list view");
  });

  it("emits one ephemeral assistant text delta before completion", async () => {
    const deltas: AgentTurnDelta[] = [];
    const events: unknown[] = [];
    const runner = createScriptedConversationRunner({
      respond: () => "streamed answer",
    });
    const result = await runner.submitTurn(
      input({
        onDelta: (delta) => {
          deltas.push(delta);
        },
        onEvent: (event) => {
          events.push(event);
        },
      }),
    );
    expect(result).toMatchObject({ text: "streamed answer" });
    expect(deltas).toEqual([
      {
        kind: "assistant_content",
        part: { type: "text", order: 1, text: "streamed answer" },
      },
    ]);
    expect(events).toEqual([
      {
        type: "assistant_delta",
        part: { type: "text", order: 1, text: "streamed answer" },
      },
    ]);
  });

  it("streams scripted provider-like reasoning parts in order", async () => {
    const events: unknown[] = [];
    const runner = createScriptedConversationRunner({
      respond: () => ({
        text: "Final answer",
        parts: [
          { type: "reasoning", order: 1, text: "Reason safely." },
          { type: "text", order: 2, text: "Final answer" },
        ],
      }),
    });

    const result = await runner.submitTurn(
      input({
        onEvent: (event) => {
          events.push(event);
        },
      }),
    );

    expect(result.parts).toEqual([
      { type: "reasoning", order: 1, text: "Reason safely." },
      { type: "text", order: 2, text: "Final answer" },
    ]);
    expect(events).toEqual([
      {
        type: "assistant_delta",
        part: { type: "reasoning", order: 1, text: "Reason safely." },
      },
      {
        type: "assistant_delta",
        part: { type: "text", order: 2, text: "Final answer" },
      },
    ]);
  });

  it("surfaces typed agent turn failures", async () => {
    const runner = createScriptedConversationRunner({
      error: new AgentTurnError("agent_unavailable"),
    });
    await expect(runner.submitTurn(input())).rejects.toMatchObject({
      code: "agent_unavailable",
    });
  });

  it("supports async scripts", async () => {
    const respond = vi.fn(async () => "async answer");
    const runner = createScriptedConversationRunner({ respond });
    await expect(runner.submitTurn(input())).resolves.toMatchObject({
      text: "async answer",
    });
  });
});
