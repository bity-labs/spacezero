import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { createPiConversationRunner } from "./pi-conversation.adapter.js";

describe("createPiConversationRunner", () => {
  it("returns a ConversationRunner with an injected credential store", () => {
    const runner = createPiConversationRunner({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      credentials: new InMemoryCredentialStore(),
    });

    expect(runner).toBeDefined();
    expect(typeof runner.submitTurn).toBe("function");
  });

  it("accepts optional system prompt", () => {
    const runner = createPiConversationRunner({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      credentials: new InMemoryCredentialStore(),
      systemPrompt: "You are a helpful assistant.",
    });

    expect(runner).toBeDefined();
  });
});
