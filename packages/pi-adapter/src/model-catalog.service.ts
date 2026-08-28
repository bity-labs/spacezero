import type {
  AuthContext,
  CredentialStore,
  Models,
} from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

export type PiThinkingLevel =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface PiModelDescriptor {
  readonly providerId: string;
  readonly providerDisplayName: string;
  readonly modelId: string;
  readonly displayName: string;
  readonly authenticated: boolean;
  readonly available: boolean;
  readonly reasoningSupported: boolean;
  readonly supportedThinkingLevels: readonly PiThinkingLevel[];
  readonly contextWindow?: number;
  readonly maxTokens?: number;
}

export interface PiModelSelection {
  readonly providerId: string;
  readonly modelId: string;
  readonly thinkingLevel: PiThinkingLevel;
}

export type PiModelCatalogErrorCode =
  | "model_not_found"
  | "model_unavailable"
  | "provider_not_authenticated"
  | "thinking_level_unsupported";

export class PiModelCatalogError extends Error {
  constructor(readonly code: PiModelCatalogErrorCode) {
    super(code);
  }
}

export interface PiModelCatalogService {
  readonly listModels: () => Promise<readonly PiModelDescriptor[]>;
  readonly validateSelection: (selection: PiModelSelection) => Promise<void>;
}

export interface PiModelCatalogServiceOptions {
  readonly credentials: CredentialStore;
  readonly models?: Models;
  readonly authContext?: AuthContext;
}

const noAmbientAuthContext: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
};

export const createPiModelCatalogService = (
  options: PiModelCatalogServiceOptions,
): PiModelCatalogService => {
  const models =
    options.models ??
    builtinModels({
      credentials: options.credentials,
      authContext: options.authContext ?? noAmbientAuthContext,
    });

  const providerAuthentication = async (): Promise<
    ReadonlyMap<string, boolean>
  > => {
    const pairs = await Promise.all(
      models.getProviders().map(async (provider) => {
        const authenticated = await models
          .checkAuth(provider.id)
          .then((auth) => auth !== undefined)
          .catch(() => false);
        return [provider.id, authenticated] as const;
      }),
    );
    return new Map(pairs);
  };

  const availableModelKeys = async (): Promise<ReadonlySet<string>> => {
    const available = await models.getAvailable().catch(() => []);
    return new Set(
      available.map((model) => `${model.provider}\u0000${model.id}`),
    );
  };

  return {
    listModels: async () => {
      await models.refresh().catch(() => undefined);
      const authenticated = await providerAuthentication();
      const available = await availableModelKeys();
      return models
        .getProviders()
        .flatMap((provider) =>
          models.getModels(provider.id).map((model): PiModelDescriptor => ({
            providerId: provider.id,
            providerDisplayName: provider.name,
            modelId: model.id,
            displayName: model.name,
            authenticated: authenticated.get(provider.id) ?? false,
            available: available.has(`${provider.id}\u0000${model.id}`),
            reasoningSupported: model.reasoning,
            supportedThinkingLevels: getSupportedThinkingLevels(
              model,
            ) as readonly PiThinkingLevel[],
            contextWindow: model.contextWindow,
            maxTokens: model.maxTokens,
          })),
        )
        .sort((left, right) =>
          `${left.providerDisplayName}\u0000${left.displayName}`.localeCompare(
            `${right.providerDisplayName}\u0000${right.displayName}`,
          ),
        );
    },
    validateSelection: async (selection) => {
      await models
        .refresh({ providers: [selection.providerId] })
        .catch(() => undefined);
      const model = models.getModel(selection.providerId, selection.modelId);
      if (!model) throw new PiModelCatalogError("model_not_found");
      const auth = await models
        .checkAuth(selection.providerId)
        .catch(() => undefined);
      if (!auth) throw new PiModelCatalogError("provider_not_authenticated");
      const available = await availableModelKeys();
      if (!available.has(`${selection.providerId}\u0000${selection.modelId}`))
        throw new PiModelCatalogError("model_unavailable");
      const supported = getSupportedThinkingLevels(model);
      if (!supported.includes(selection.thinkingLevel))
        throw new PiModelCatalogError("thinking_level_unsupported");
    },
  };
};
