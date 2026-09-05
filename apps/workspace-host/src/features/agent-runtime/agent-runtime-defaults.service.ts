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
      } else if (
        request.defaultModel &&
        current.defaultThinkingLevel !== null &&
        targetModel
      ) {
        nextThinking = isSupportedThinkingLevel(
          targetModel,
          current.defaultThinkingLevel,
        )
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
  };
};
