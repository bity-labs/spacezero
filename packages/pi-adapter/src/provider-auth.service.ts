import type {
  AuthContext,
  Credential,
  CredentialStore,
  Models,
  Provider,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
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
export type ProviderLoginPrompt = {
  readonly signal?: AbortSignal;
} & (
  | {
      readonly type: "text";
      readonly message: string;
      readonly placeholder?: string;
    }
  | {
      readonly type: "secret";
      readonly message: string;
      readonly placeholder?: string;
    }
  | {
      readonly type: "select";
      readonly message: string;
      readonly options: readonly {
        readonly id: string;
        readonly label: string;
        readonly description?: string;
      }[];
    }
  | {
      readonly type: "manual_code";
      readonly message: string;
      readonly placeholder?: string;
    }
);
export type ProviderLoginEvent =
  | {
      readonly type: "info";
      readonly message: string;
      readonly links?: readonly {
        readonly url: string;
        readonly label?: string;
      }[];
    }
  | {
      readonly type: "auth_url";
      readonly url: string;
      readonly instructions?: string;
    }
  | {
      readonly type: "device_code";
      readonly userCode: string;
      readonly verificationUri: string;
      readonly intervalSeconds?: number;
      readonly expiresInSeconds?: number;
    }
  | { readonly type: "progress"; readonly message: string };
export interface ProviderLoginInteraction {
  readonly signal?: AbortSignal;
  readonly prompt: (prompt: ProviderLoginPrompt) => Promise<string>;
  readonly notify: (event: ProviderLoginEvent) => void;
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
  readonly loginOAuth: (
    providerId: string,
    interaction: ProviderLoginInteraction,
  ) => Promise<ProviderAuthStatus>;
  readonly setApiKey: (
    providerId: string,
    apiKey: string,
  ) => Promise<ProviderAuthStatus>;
  readonly removeApiKey: (providerId: string) => Promise<ProviderAuthStatus>;
}

export interface ProviderAuthServiceOptions {
  readonly credentials: CredentialStore;
  readonly models?: Models;
  readonly authContext?: AuthContext;
}

const noAmbientAuthContext: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
};

const providerFor = (models: Models, providerId: string): Provider => {
  if (!isValidProviderId(providerId))
    throw new ProviderAuthError("invalid_provider");
  const provider = models.getProvider(providerId);
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

const assertApiKeyProvider = (models: Models, providerId: string): Provider => {
  const provider = providerFor(models, providerId);
  if (!provider.auth.apiKey)
    throw new ProviderAuthError("provider_not_supported");
  return provider;
};

const assertOAuthProvider = (models: Models, providerId: string): Provider => {
  const provider = providerFor(models, providerId);
  if (!provider.auth.oauth)
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
  options: CredentialStore | ProviderAuthServiceOptions,
): ProviderAuthService => {
  const credentials = "credentials" in options ? options.credentials : options;
  const models =
    "credentials" in options && options.models
      ? options.models
      : builtinModels({
          credentials,
          authContext:
            "credentials" in options
              ? (options.authContext ?? noAmbientAuthContext)
              : noAmbientAuthContext,
        });
  const status = async (providerId: string): Promise<ProviderAuthStatus> => {
    try {
      const provider = providerFor(models, providerId);
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
          models.getProviders().map(async (provider) => {
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
    loginOAuth: async (providerId, interaction) => {
      try {
        assertOAuthProvider(models, providerId);
        await models.login(providerId, "oauth", interaction);
        return await status(providerId);
      } catch (error) {
        throw mapStorageError(error);
      }
    },
    setApiKey: async (providerId, apiKey) => {
      try {
        assertApiKeyProvider(models, providerId);
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
        providerFor(models, providerId);
        await credentials.delete(providerId);
        return await status(providerId);
      } catch (error) {
        throw mapStorageError(error);
      }
    },
  };
};
