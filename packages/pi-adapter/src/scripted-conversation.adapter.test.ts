import { describe, expect, it, vi } from "vitest";
import {
  AgentTurnError,
  type AgentTurnDelta,
  type AgentTurnInput,
} from "./conversation.model.js";
import { createScriptedConversationRunner } from "./scripted-conversation.adapter.js";

const input = (overrides: Partial<AgentTurnInput> = {}): AgentTurnInput => ({
  worktreePath: "/spacezero/worktrees/project/session",
  prompt: "Build the wine list view",
  ...overrides,
});

describe("scripted conversation runner", () => {
  it("echoes the prompt by default so Host flows stay deterministic", async () => {
    const runner = createScriptedConversationRunner();
    await expect(runner.submitTurn(input())).resolves.toEqual({
      text: "Echo: Build the wine list view",
    });
  });

  it("passes the authenticated worktree path and prompt to the script", async () => {
    const seen: AgentTurnInput[] = [];
    const runner = createScriptedConversationRunner({
      respond: (turn) => {
        seen.push(turn);
        return "done";
      },
    });
    await runner.submitTurn(input());
    expect(seen).toHaveLength(1);
    expect(seen[0]?.worktreePath).toBe("/spacezero/worktrees/project/session");
    expect(seen[0]?.prompt).toBe("Build the wine list view");
  });

  it("emits one ephemeral assistant text delta before completion", async () => {
    const deltas: AgentTurnDelta[] = [];
    const runner = createScriptedConversationRunner({
      respond: () => "streamed answer",
    });
    const result = await runner.submitTurn(
      input({ onDelta: (delta) => deltas.push(delta) }),
    );
    expect(result).toEqual({ text: "streamed answer" });
    expect(deltas).toEqual([
      { kind: "assistant_text", text: "streamed answer" },
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
    await expect(runner.submitTurn(input())).resolves.toEqual({
      text: "async answer",
    });
  });
});
