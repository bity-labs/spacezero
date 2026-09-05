import { describe, expect, it } from "vitest";

import type { AgentModelDescriptor, AgentRuntimeDefaults, ProviderAuthOption } from "@spacezero/host-contracts";

import {
  availableModelsFromDescriptors,
  authSettingsFromProviderOptions,
  clientErrorMessage,
  modelDefaultsFromAgentRuntimeDefaults,
} from "./models-settings-data";

const providerOption = (overrides: Partial<ProviderAuthOption> = {}): ProviderAuthOption => ({
  providerId: "openai",
  displayName: "OpenAI",
  authMethods: ["api_key"],
  configured: false,
  ...overrides,
});

const modelDescriptor = (overrides: Partial<AgentModelDescriptor> = {}): AgentModelDescriptor => ({
  providerId: "openai",
  providerDisplayName: "OpenAI",
  modelId: "gpt-5.2",
  displayName: "GPT-5.2",
  authenticated: true,
  available: true,
  reasoningSupported: true,
  supportedThinkingLevels: ["off", "low", "medium", "high"],
  ...overrides,
});

describe("authSettingsFromProviderOptions", () => {
  it("splits configured OAuth providers into connected subscriptions and unconfigured ones into options", () => {
    const settings = authSettingsFromProviderOptions([
      providerOption({
        providerId: "anthropic-subscription",
        displayName: "Claude Pro/Max",
        authMethods: ["oauth"],
        configured: true,
        configuredMethod: "oauth",
      }),
      providerOption({
        providerId: "openai-subscription",
        displayName: "ChatGPT Plus/Pro",
        authMethods: ["oauth"],
      }),
    ]);

    expect(settings.subscriptions.connected).toEqual([
      {
        providerId: "anthropic-subscription",
        label: "Claude Pro/Max",
        configured: true,
        displayLabel: "Connected with subscription",
        removable: false,
      },
    ]);
    expect(settings.subscriptions.availableProviders).toEqual([
      {
        providerId: "openai-subscription",
        label: "ChatGPT Plus/Pro",
        description: "Connect a subscription in your browser.",
      },
    ]);
    expect(settings.apiKeys.configured).toEqual([]);
    expect(settings.apiKeys.availableProviders).toEqual([]);
  });

  it("uses the configured method to classify providers that support both methods", () => {
    const settings = authSettingsFromProviderOptions([
      providerOption({
        providerId: "anthropic",
        displayName: "Anthropic",
        authMethods: ["api_key", "oauth"],
        configured: true,
        configuredMethod: "api_key",
      }),
    ]);

    expect(settings.apiKeys.configured).toHaveLength(1);
    expect(settings.subscriptions.connected).toEqual([]);
    expect(settings.subscriptions.availableProviders).toEqual([
      {
        providerId: "anthropic",
        label: "Anthropic",
        description: "Connect a subscription in your browser.",
      },
    ]);
    expect(settings.apiKeys.availableProviders).toEqual([]);
  });

  it("splits configured API-key providers into removable entries and unconfigured ones into options", () => {
    const settings = authSettingsFromProviderOptions([
      providerOption({
        providerId: "anthropic",
        displayName: "Anthropic",
        configured: true,
        configuredMethod: "api_key",
      }),
      providerOption({ providerId: "google", displayName: "Google Gemini" }),
    ]);

    expect(settings.apiKeys.configured).toEqual([
      {
        providerId: "anthropic",
        label: "Anthropic",
        configured: true,
        displayLabel: "API key stored",
        source: "stored",
        removable: true,
      },
    ]);
    expect(settings.apiKeys.availableProviders).toEqual([
      {
        providerId: "google",
        label: "Google Gemini",
        description: "Store an API key for this provider.",
      },
    ]);
    expect(settings.subscriptions.connected).toEqual([]);
    expect(settings.subscriptions.availableProviders).toEqual([]);
  });
});

describe("availableModelsFromDescriptors", () => {
  it("keeps only available models and maps sanitized descriptors to view models", () => {
    const models = availableModelsFromDescriptors([
      modelDescriptor(),
      modelDescriptor({ modelId: "gpt-5.2-mini", displayName: "GPT-5.2 mini" }),
      modelDescriptor({ modelId: "locked-model", available: false }),
      modelDescriptor({ modelId: "unauth-model", authenticated: false, available: false }),
    ]);

    expect(models).toEqual([
      {
        providerId: "openai",
        providerLabel: "OpenAI",
        modelId: "gpt-5.2",
        modelLabel: "GPT-5.2",
        supportsThinking: true,
        supportedThinkingLevels: ["off", "low", "medium", "high"],
      },
      {
        providerId: "openai",
        providerLabel: "OpenAI",
        modelId: "gpt-5.2-mini",
        modelLabel: "GPT-5.2 mini",
        supportsThinking: true,
        supportedThinkingLevels: ["off", "low", "medium", "high"],
      },
    ]);
  });
});

describe("modelDefaultsFromAgentRuntimeDefaults", () => {
  it("maps a fresh Host without defaults to an empty view model", () => {
    const defaults: AgentRuntimeDefaults = {
      defaultModel: null,
      defaultThinkingLevel: null,
    };

    expect(modelDefaultsFromAgentRuntimeDefaults(defaults)).toEqual({});
  });

  it("maps selected defaults to view model values", () => {
    const defaults: AgentRuntimeDefaults = {
      defaultModel: { providerId: "openai", modelId: "gpt-5.2" },
      defaultThinkingLevel: "high",
    };

    expect(modelDefaultsFromAgentRuntimeDefaults(defaults)).toEqual({
      defaultModel: { providerId: "openai", modelId: "gpt-5.2" },
      defaultThinking: "high",
    });
  });
});

describe("clientErrorMessage", () => {
  it("uses the client-safe message from Host protocol errors", () => {
    expect(clientErrorMessage({ code: "invalid_api_key", message: "Enter a valid API key." }, "fallback")).toBe(
      "Enter a valid API key.",
    );
  });

  it("falls back to a stable message for unknown failures", () => {
    expect(clientErrorMessage(new Error("stack trace detail"), "fallback")).toBe("fallback");
    expect(clientErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
