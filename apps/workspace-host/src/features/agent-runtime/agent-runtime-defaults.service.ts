import type {
  AgentRuntimeDefaultModel,
  AgentRuntimeDefaults,
  AgentModelDescriptor,
  AgentThinkingLevel,
  GetAgentRuntimeDefaultsResult,
  UpdateAgentRuntimeDefaultsRequest,
  UpdateAgentRuntimeDefaultsResult,
} from "@spacezero/host-contracts";
import type { PiModelCatalogService } from "@spacezero/pi-adapter";
import { AgentRuntimeDefaultsServiceError } from "./agent-runtime-defaults.model.js";
import { createAgentRuntimeDefaultsRepository } from "./agent-runtime-defaults.repository.js";

export interface AgentRuntimeDefaultsService {
  readonly get: () => Promise<GetAgentRuntimeDefaultsResult>;
  readonly update: (
    request: UpdateAgentRuntimeDefaultsRequest,
  ) => Promise<UpdateAgentRuntimeDefaultsResult>;
  /** Initialize Host-global defaults after successful provider auth when no
   * default model exists. Never overwrites an existing default. */
  readonly initializeAfterAuth: (
    providerId: string,
  ) => Promise<GetAgentRuntimeDefaultsResult>;
  /** Clear or replace the Host-global default when removing provider auth
   * makes the selected default model unavailable. */
  readonly reconcileAfterAuthRemoval: (
    providerId: string,
  ) => Promise<GetAgentRuntimeDefaultsResult>;
}

const findCatalogModel = (
  catalog: readonly AgentModelDescriptor[],
  model: AgentRuntimeDefaultModel,
): AgentModelDescriptor => {
  const descriptor = catalog.find(
    (candidate) =>
      candidate.providerId === model.providerId &&
      candidate.modelId === model.modelId,
  );
  if (!descriptor)
    throw new AgentRuntimeDefaultsServiceError("model_not_found");
  if (!descriptor.available)
    throw new AgentRuntimeDefaultsServiceError("model_unavailable");
  return descriptor;
};

const isSupportedThinkingLevel = (
  model: AgentModelDescriptor,
  thinkingLevel: AgentThinkingLevel,
): boolean => model.supportedThinkingLevels.includes(thinkingLevel);

const firstAvailableDefaults = (
  catalog: readonly AgentModelDescriptor[],
  providerId?: string,
): AgentRuntimeDefaults | null => {
  // A model with no supported thinking levels cannot satisfy the "first
  // supported thinking level" invariant, so skip it; initializing it would
  // persist a default that blocks new Session creation.
  const model = catalog.find(
    (candidate) =>
      candidate.available &&
      candidate.supportedThinkingLevels.length > 0 &&
      (providerId === undefined || candidate.providerId === providerId),
  );
  if (!model) return null;
  return {
    defaultModel: { providerId: model.providerId, modelId: model.modelId },
    defaultThinkingLevel: model.supportedThinkingLevels[0] ?? null,
  };
};

export const createAgentRuntimeDefaultsService = (options: {
  readonly databasePath: string;
  readonly modelCatalog: PiModelCatalogService;
}): AgentRuntimeDefaultsService => {
  const repository = createAgentRuntimeDefaultsRepository(options);

  const listCatalog = async (): Promise<readonly AgentModelDescriptor[]> => {
    try {
      return await options.modelCatalog.listModels();
    } catch {
      throw new AgentRuntimeDefaultsServiceError("agent_runtime_unavailable");
    }
  };

  return {
    get: async () => ({ defaults: await repository.get() }),

    update: async (request) => {
      const current = await repository.get();
      const catalog = await listCatalog();

      const nextModel = request.defaultModel ?? current.defaultModel;
      let targetModel: AgentModelDescriptor | undefined;
      if (nextModel) targetModel = findCatalogModel(catalog, nextModel);

      let nextThinking: AgentThinkingLevel | null;
      if (request.defaultThinkingLevel !== undefined) {
        if (!nextModel || !targetModel)
          throw new AgentRuntimeDefaultsServiceError("default_model_required");
        if (!isSupportedThinkingLevel(targetModel, request.defaultThinkingLevel))
          throw new AgentRuntimeDefaultsServiceError(
            "thinking_level_unsupported",
          );
        nextThinking = request.defaultThinkingLevel;
      } else if (request.defaultModel && targetModel) {
        nextThinking =
          current.defaultThinkingLevel !== null &&
          isSupportedThinkingLevel(targetModel, current.defaultThinkingLevel)
            ? current.defaultThinkingLevel
            : (targetModel.supportedThinkingLevels[0] ?? null);
      } else {
        nextThinking = current.defaultThinkingLevel;
      }

      const defaults: AgentRuntimeDefaults = {
        defaultModel: nextModel
          ? { providerId: nextModel.providerId, modelId: nextModel.modelId }
          : null,
        defaultThinkingLevel: nextThinking,
      };
      await repository.put(defaults);
      return { defaults };
    },

    initializeAfterAuth: async (providerId) => {
      const current = await repository.get();
      if (current.defaultModel) return { defaults: current };
      const catalog = await listCatalog();
      const initialized = firstAvailableDefaults(catalog, providerId);
      if (!initialized) return { defaults: current };
      // Single-statement conditional write: if a concurrent auth completion
      // initialized the defaults first, this call reports the stored state
      // instead of overwriting it.
      return { defaults: await repository.putIfAbsentModel(initialized) };
    },

    reconcileAfterAuthRemoval: async (providerId) => {
      const current = await repository.get();
      if (!current.defaultModel) return { defaults: current };
      const catalog = await listCatalog();
      const descriptor = catalog.find(
        (candidate) =>
          candidate.providerId === current.defaultModel?.providerId &&
          candidate.modelId === current.defaultModel?.modelId,
      );
      if (descriptor && descriptor.available) return { defaults: current };
      // The removed provider no longer offers usable models; pick the first
      // available replacement from the remaining catalog ordering.
      const replacement = firstAvailableDefaults(
        catalog.filter((candidate) => candidate.providerId !== providerId),
      );
      const defaults = replacement ?? {
        defaultModel: null,
        defaultThinkingLevel: null,
      };
      await repository.put(defaults);
      return { defaults };
    },
  };
};
