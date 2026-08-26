import type {
  Credential,
  CredentialStore,
  Provider,
} from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import {
  ProviderAuthStorageError,
  isValidProviderId,
} from "./provider-auth.storage.js";

export type ProviderAuthSource = "stored" | "missing";
export type ProviderAuthMethod = "api_key" | "oauth";
export interface ProviderAuthOption {
  readonly providerId: string;
  readonly displayName: string;
  readonly authMethods: readonly ProviderAuthMethod[];
  readonly configured: boolean;
  readonly configuredMethod?: ProviderAuthMethod;
}
export interface ProviderAuthStatus {
  readonly providerId: string;
  readonly configured: boolean;
  readonly source: ProviderAuthSource;
}

export type ProviderAuthErrorCode =
  | "invalid_provider"
  | "provider_not_supported"
  | "invalid_api_key"
  | "harness_auth_unavailable";

export class ProviderAuthError extends Error {
  constructor(readonly code: ProviderAuthErrorCode) {
    super(code);
  }
}

export interface ProviderAuthService {
  readonly listOptions: () => Promise<readonly ProviderAuthOption[]>;
  readonly status: (providerId: string) => Promise<ProviderAuthStatus>;
  readonly setApiKey: (
    providerId: string,
    apiKey: string,
  ) => Promise<ProviderAuthStatus>;
  readonly removeApiKey: (providerId: string) => Promise<ProviderAuthStatus>;
}

const supportedProviders = new Map<string, Provider>(
  builtinProviders().map((provider) => [provider.id, provider]),
);

const providerFor = (providerId: string): Provider => {
  if (!isValidProviderId(providerId))
    throw new ProviderAuthError("invalid_provider");
  const provider = supportedProviders.get(providerId);
  if (!provider) throw new ProviderAuthError("provider_not_supported");
  return provider;
};

const authMethodsFor = (provider: Provider): readonly ProviderAuthMethod[] => [
  ...(provider.auth.apiKey ? (["api_key"] as const) : []),
  ...(provider.auth.oauth ? (["oauth"] as const) : []),
];

const methodForCredential = (
  provider: Provider,
  credential: Credential,
): ProviderAuthMethod | undefined => {
  if (credential.type === "api_key" && provider.auth.apiKey) return "api_key";
  if (credential.type === "oauth" && provider.auth.oauth) return "oauth";
  return undefined;
};

const supportsCredential = (
  provider: Provider,
  credential: Credential,
): boolean => methodForCredential(provider, credential) !== undefined;

const assertApiKeyProvider = (providerId: string): Provider => {
  const provider = providerFor(providerId);
  if (!provider.auth.apiKey)
    throw new ProviderAuthError("provider_not_supported");
  return provider;
};

const mapStorageError = (error: unknown): ProviderAuthError => {
  if (error instanceof ProviderAuthError) return error;
  if (error instanceof ProviderAuthStorageError) {
    switch (error.code) {
      case "invalid_provider":
        return new ProviderAuthError("invalid_provider");
      case "invalid_credential":
        return new ProviderAuthError("invalid_api_key");
      case "storage_unavailable":
        return new ProviderAuthError("harness_auth_unavailable");
    }
  }
  return new ProviderAuthError("harness_auth_unavailable");
};

export const createProviderAuthService = (
  credentials: CredentialStore,
): ProviderAuthService => {
  const status = async (providerId: string): Promise<ProviderAuthStatus> => {
    try {
      const provider = providerFor(providerId);
      const credential = await credentials.read(providerId);
      return credential && supportsCredential(provider, credential)
        ? { providerId, configured: true, source: "stored" }
        : { providerId, configured: false, source: "missing" };
    } catch (error) {
      throw mapStorageError(error);
    }
  };
  return {
    listOptions: async () => {
      try {
        const options = await Promise.all(
          [...supportedProviders.values()].map(async (provider) => {
            const credential = await credentials.read(provider.id);
            const configuredMethod = credential
              ? methodForCredential(provider, credential)
              : undefined;
            return {
              providerId: provider.id,
              displayName: provider.name,
              authMethods: authMethodsFor(provider),
              configured: configuredMethod !== undefined,
              ...(configuredMethod ? { configuredMethod } : {}),
            };
          }),
        );
        return options.sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        );
      } catch (error) {
        throw mapStorageError(error);
      }
    },
    status,
    setApiKey: async (providerId, apiKey) => {
      try {
        assertApiKeyProvider(providerId);
        await credentials.modify(providerId, async () => ({
          type: "api_key",
          key: apiKey,
        }));
        return await status(providerId);
      } catch (error) {
        throw mapStorageError(error);
      }
    },
    removeApiKey: async (providerId) => {
      try {
        providerFor(providerId);
        await credentials.delete(providerId);
        return await status(providerId);
      } catch (error) {
        throw mapStorageError(error);
      }
    },
  };
};
