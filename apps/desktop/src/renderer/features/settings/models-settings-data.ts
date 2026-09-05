import type {
  AgentModelDescriptor,
  AgentRuntimeDefaults,
  FlowEvent,
  ProviderAuthMethod,
  ProviderAuthOption,
} from "@spacezero/host-contracts";

import type {
  AvailableModel,
  FlowPrompt,
  ModelAuthSettings,
  ModelDefaults,
  SubscriptionStatusTone,
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

export type FlowStatusUpdate = {
  /** Client-safe status line for the Subscriptions card, when it changes. */
  readonly message?: string;
  readonly tone: SubscriptionStatusTone;
  /** Whether this event ends the flow and the container should clean up. */
  readonly terminal: boolean;
  /** External provider URL to open through the Desktop-safe path. */
  readonly openUrl?: string;
  /** Provider sign-in prompt awaiting a response. */
  readonly prompt?: FlowPrompt;
};

/**
 * Maps a Host OAuth flow event to the client-safe subscription status update.
 * Only sanitized flow payloads (messages, codes, verification URLs, prompts)
 * reach the renderer; tokens and callback secrets never appear in flow events.
 */
export function flowStatusUpdateFromEvent(
  event: FlowEvent,
  providerLabel: string,
): FlowStatusUpdate {
  switch (event.type) {
    case "flow.started":
      return { tone: "info", terminal: false, message: `Connecting to ${providerLabel}…` };
    case "flow.info":
      return { tone: "info", terminal: false, message: event.message };
    case "flow.external_url":
      return {
        tone: "info",
        terminal: false,
        message:
          event.instructions ?? `Finish signing in to ${providerLabel} in your browser.`,
        openUrl: event.url,
      };
    case "flow.device_code":
      return {
        tone: "info",
        terminal: false,
        message: `Enter the code ${event.userCode} at ${event.verificationUri} to finish signing in to ${providerLabel}.`,
        openUrl: event.verificationUri,
      };
    case "flow.progress":
      return { tone: "info", terminal: false, message: event.message };
    case "flow.prompt":
      return {
        tone: "info",
        terminal: false,
        prompt: {
          promptId: event.promptId,
          promptType: event.promptType,
          message: event.message,
          ...(event.placeholder ? { placeholder: event.placeholder } : {}),
          ...(event.options ? { options: event.options } : {}),
        },
      };
    case "flow.completed":
      return { tone: "info", terminal: true, message: `${providerLabel} connected.` };
    case "flow.failed":
      return {
        tone: "error",
        terminal: true,
        message: event.reason || `Sign-in to ${providerLabel} failed.`,
      };
    case "flow.cancelled":
      return {
        tone: "info",
        terminal: true,
        message: `Sign-in to ${providerLabel} was cancelled.`,
      };
  }
}
