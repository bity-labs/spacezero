import type {
  AgentModelDescriptor,
  AgentRuntimeDefaults,
  ProviderAuthMethod,
  ProviderAuthOption,
} from "@spacezero/host-contracts";

import type {
  AvailableModel,
  ModelAuthSettings,
  ModelDefaults,
} from "./models-settings-screen";

/**
 * Pure mappings from Host protocol payloads (Client Runtime results) to the
 * presentational Models settings screen props. Renderer code only ever sees
 * sanitized view models, never stored secrets, Pi auth storage paths, or raw
 * Pi model/provider objects.
 */

const SUBSCRIPTION_CONNECTED_LABEL = "Connected with subscription";
const API_KEY_STORED_LABEL = "API key stored";

const supportsSubscriptionAuth = (provider: ProviderAuthOption): boolean =>
  provider.authMethods.includes("oauth");

const supportsApiKeyAuth = (provider: ProviderAuthOption): boolean =>
  provider.authMethods.includes("api_key");

const configuredVia = (
  provider: ProviderAuthOption,
  method: ProviderAuthMethod,
): boolean => provider.configured && provider.configuredMethod === method;

export function authSettingsFromProviderOptions(
  providers: readonly ProviderAuthOption[],
): ModelAuthSettings {
  return {
    subscriptions: {
      connected: providers
        .filter((provider) => configuredVia(provider, "oauth"))
        .map((provider) => ({
          providerId: provider.providerId,
          label: provider.displayName,
          configured: true,
          displayLabel: SUBSCRIPTION_CONNECTED_LABEL,
          removable: false,
        })),
      availableProviders: providers
        .filter(
          (provider) =>
            supportsSubscriptionAuth(provider) && !configuredVia(provider, "oauth"),
        )
        .map((provider) => ({
          providerId: provider.providerId,
          label: provider.displayName,
          description: "Connect a subscription in your browser.",
        })),
    },
    apiKeys: {
      configured: providers
        .filter((provider) => configuredVia(provider, "api_key"))
        .map((provider) => ({
          providerId: provider.providerId,
          label: provider.displayName,
          configured: true,
          displayLabel: API_KEY_STORED_LABEL,
          source: "stored" as const,
          removable: true,
        })),
      availableProviders: providers
        .filter(
          (provider) =>
            supportsApiKeyAuth(provider) && !configuredVia(provider, "api_key"),
        )
        .map((provider) => ({
          providerId: provider.providerId,
          label: provider.displayName,
          description: "Store an API key for this provider.",
        })),
    },
  };
}

export function availableModelsFromDescriptors(
  models: readonly AgentModelDescriptor[],
): AvailableModel[] {
  return models
    .filter((model) => model.available)
    .map((model) => ({
      providerId: model.providerId,
      providerLabel: model.providerDisplayName,
      modelId: model.modelId,
      modelLabel: model.displayName,
      supportsThinking: model.reasoningSupported,
      supportedThinkingLevels: [...model.supportedThinkingLevels],
    }));
}

export function modelDefaultsFromAgentRuntimeDefaults(
  hostDefaults: AgentRuntimeDefaults,
): ModelDefaults {
  const modelDefaults: ModelDefaults = {};
  if (hostDefaults.defaultModel) modelDefaults.defaultModel = hostDefaults.defaultModel;
  if (hostDefaults.defaultThinkingLevel) {
    modelDefaults.defaultThinking = hostDefaults.defaultThinkingLevel;
  }
  return modelDefaults;
}

/**
 * Extracts a client-safe message from a Host protocol failure. Only plain
 * protocol payloads with an explicit message are trusted; anything else
 * (internal Error instances, wrapped Effect failures) falls back to a stable
 * message so internal details never reach the UI.
 */
export function clientErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    !Array.isArray(error) &&
    !(error instanceof Error)
  ) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}
