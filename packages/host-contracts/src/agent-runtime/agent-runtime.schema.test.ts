import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AgentModelDescriptorSchema,
  AgentThinkingLevelSchema,
  ListAgentRuntimeModelsResultSchema,
} from "./agent-runtime.schema.js";

const parseSync = Schema.decodeUnknownSync;

describe("Agent Runtime schemas", () => {
  it("accepts sanitized model descriptors and thinking levels", () => {
    expect(parseSync(AgentThinkingLevelSchema)("high")).toBe("high");
    expect(
      parseSync(AgentModelDescriptorSchema)({
        providerId: "anthropic",
        providerDisplayName: "Anthropic",
        modelId: "claude-sonnet-4-5",
        displayName: "Claude Sonnet 4.5",
        authenticated: true,
        available: true,
        reasoningSupported: true,
        supportedThinkingLevels: ["off", "high"],
        contextWindow: 200000,
        maxTokens: 8192,
      }),
    ).toMatchObject({ providerId: "anthropic", modelId: "claude-sonnet-4-5" });
  });

  it("rejects unsupported thinking levels and malformed descriptors", () => {
    expect(() => parseSync(AgentThinkingLevelSchema)("secret")).toThrow();
    expect(() =>
      parseSync(ListAgentRuntimeModelsResultSchema)({
        models: [
          {
            providerId: "anthropic",
            providerDisplayName: "Anthropic",
            modelId: "claude-sonnet-4-5",
            displayName: "Claude Sonnet 4.5",
            authenticated: true,
            available: true,
            reasoningSupported: true,
            supportedThinkingLevels: ["secret"],
          },
        ],
      }),
    ).toThrow();
  });
});
