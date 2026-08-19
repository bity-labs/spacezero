import { describe, expect, it } from "vitest";
import { createPiConversationRunner } from "./pi-conversation.adapter.js";

describe("createPiConversationRunner", () => {
  it("returns a ConversationRunner", () => {
    const runner = createPiConversationRunner({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKey: "test-key",
    });

    expect(runner).toBeDefined();
    expect(typeof runner.submitTurn).toBe("function");
  });

  it("accepts optional system prompt", () => {
    const runner = createPiConversationRunner({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKey: "test-key",
      systemPrompt: "You are a helpful assistant.",
    });

    expect(runner).toBeDefined();
  });
});
