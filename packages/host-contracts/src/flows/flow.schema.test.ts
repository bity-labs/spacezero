import { describe, expect, it } from "vitest";
import {
  parseFlowEventEnvelope,
  parseFlowPromptResponseRequest,
} from "./flow.schema.js";

describe("flow schemas", () => {
  it("accepts non-secret OAuth flow events", () => {
    expect(
      parseFlowEventEnvelope({
        flowId: "flow_123",
        sequence: 1,
        event: { type: "flow.started" },
      }),
    ).toEqual({
      flowId: "flow_123",
      sequence: 1,
      event: { type: "flow.started" },
    });
    expect(
      parseFlowEventEnvelope({
        flowId: "flow_123",
        sequence: 2,
        event: {
          type: "flow.prompt",
          promptId: "prompt_123",
          promptType: "select",
          message: "Choose a method",
          options: [{ id: "browser", label: "Browser" }],
        },
      }).event,
    ).toMatchObject({ type: "flow.prompt", promptType: "select" });
    expect(
      parseFlowEventEnvelope({
        flowId: "flow_123",
        sequence: 3,
        event: {
          type: "flow.completed",
          status: {
            providerId: "anthropic",
            configured: true,
            source: "stored",
          },
        },
      }).event,
    ).toMatchObject({ type: "flow.completed" });
  });

  it("rejects extra fields that could carry secrets", () => {
    for (const event of [
      {
        type: "flow.external_url",
        url: "https://example.com",
        access: "secret",
      },
      {
        type: "flow.prompt",
        promptId: "prompt_123",
        promptType: "manual_code",
        message: "Paste code",
        response: "secret-code",
      },
      { type: "flow.completed", refresh: "refresh-token" },
    ]) {
      expect(() =>
        parseFlowEventEnvelope({ flowId: "flow_123", sequence: 1, event }),
      ).toThrow("invalid flow event envelope");
    }
  });

  it("accepts bounded prompt responses without extra keys", () => {
    expect(parseFlowPromptResponseRequest({ response: "code" })).toEqual({
      response: "code",
    });
    expect(() =>
      parseFlowPromptResponseRequest({ response: "code", apiKey: "secret" }),
    ).toThrow("invalid flow response");
    expect(() =>
      parseFlowPromptResponseRequest({ response: "x".repeat(20_000) }),
    ).toThrow("invalid flow response");
  });
});
