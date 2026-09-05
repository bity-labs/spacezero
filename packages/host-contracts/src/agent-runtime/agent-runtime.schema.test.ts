import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  AgentModelDescriptorSchema,
  AgentRuntimeDefaultModelSchema,
  AgentRuntimeDefaultsSchema,
  AgentThinkingLevelSchema,
  ListAgentRuntimeModelsResultSchema,
  UpdateAgentRuntimeDefaultsRequestSchema,
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

  it("accepts client-safe defaults payloads and fresh-Host empty defaults", () => {
    expect(
      parseSync(AgentRuntimeDefaultsSchema)({
        defaultModel: null,
        defaultThinkingLevel: null,
      }),
    ).toEqual({ defaultModel: null, defaultThinkingLevel: null });
    expect(
      parseSync(AgentRuntimeDefaultsSchema)({
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
        defaultThinkingLevel: "high",
      }),
    ).toEqual({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "high",
    });
    expect(
      parseSync(UpdateAgentRuntimeDefaultsRequestSchema)({}),
    ).toEqual({});
    expect(
      parseSync(UpdateAgentRuntimeDefaultsRequestSchema)({
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
        defaultThinkingLevel: "low",
      }),
    ).toEqual({
      defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
      defaultThinkingLevel: "low",
    });
  });

  it("rejects malformed default model selections and defaults payloads", () => {
    expect(() =>
      parseSync(AgentRuntimeDefaultModelSchema)({ providerId: "anthropic" }),
    ).toThrow();
    expect(() =>
      parseSync(AgentRuntimeDefaultModelSchema)({
        providerId: "",
        modelId: "claude-sonnet-4-5",
      }),
    ).toThrow();
    expect(() =>
      parseSync(AgentRuntimeDefaultsSchema)({
        defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
        defaultThinkingLevel: "secret",
      }),
    ).toThrow();
    expect(() =>
      parseSync(UpdateAgentRuntimeDefaultsRequestSchema)({
        defaultModel: { providerId: "anthropic", modelId: "" },
      }),
    ).toThrow();
  });
});
