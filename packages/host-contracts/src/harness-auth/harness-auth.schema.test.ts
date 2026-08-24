import { describe, expect, it } from "vitest";
import {
  parseProviderAuthStatusResult,
  parseSetProviderApiKeyRequest,
} from "./harness-auth.schema.js";

describe("harness auth schemas", () => {
  it("accepts non-secret provider status results", () => {
    expect(
      parseProviderAuthStatusResult({
        status: {
          providerId: "anthropic",
          configured: true,
          source: "stored",
        },
      }),
    ).toEqual({
      status: {
        providerId: "anthropic",
        configured: true,
        source: "stored",
      },
    });
  });

  it("rejects status secrets, invalid providers, and inconsistent configured source", () => {
    expect(() =>
      parseProviderAuthStatusResult({
        status: {
          providerId: "anthropic",
          configured: true,
          source: "stored",
          apiKey: "secret",
        },
      }),
    ).toThrow();
    expect(() =>
      parseProviderAuthStatusResult({
        status: {
          providerId: "../anthropic",
          configured: false,
          source: "missing",
        },
      }),
    ).toThrow();
    expect(() =>
      parseProviderAuthStatusResult({
        status: {
          providerId: "anthropic",
          configured: false,
          source: "stored",
        },
      }),
    ).toThrow();
  });

  it("accepts bounded write-only API key requests", () => {
    expect(parseSetProviderApiKeyRequest({ apiKey: "sk-test" })).toEqual({
      apiKey: "sk-test",
    });
    expect(() => parseSetProviderApiKeyRequest({ apiKey: "" })).toThrow();
    expect(() =>
      parseSetProviderApiKeyRequest({ apiKey: "x".repeat(20_000) }),
    ).toThrow();
  });
});
