import {
  createModels,
  fauxProvider,
  InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  PiModelCatalogError,
  createPiModelCatalogService,
} from "./model-catalog.service.js";

describe("Pi model catalog service", () => {
  it("lists sanitized model descriptors from Pi Models", async () => {
    const faux = fauxProvider({
      models: [
        {
          id: "fast-model",
          name: "Fast Model",
          reasoning: false,
          contextWindow: 32000,
          maxTokens: 4096,
        },
        {
          id: "reasoning-model",
          name: "Reasoning Model",
          reasoning: true,
          contextWindow: 128000,
          maxTokens: 8192,
        },
      ],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    const service = createPiModelCatalogService({
      credentials: new InMemoryCredentialStore(),
      models,
    });

    const descriptors = await service.listModels();

    expect(descriptors).toEqual([
      expect.objectContaining({
        providerId: faux.provider.id,
        providerDisplayName: faux.provider.name,
        modelId: "fast-model",
        displayName: "Fast Model",
        reasoningSupported: false,
        supportedThinkingLevels: ["off"],
        contextWindow: 32000,
        maxTokens: 4096,
      }),
      expect.objectContaining({
        providerId: faux.provider.id,
        modelId: "reasoning-model",
        displayName: "Reasoning Model",
        reasoningSupported: true,
      }),
    ]);
    expect(JSON.stringify(descriptors)).not.toContain("headers");
    expect(JSON.stringify(descriptors)).not.toContain("apiKey");
  });

  it("rejects unavailable models", async () => {
    const faux = fauxProvider({
      models: [{ id: "filtered", name: "Filtered", reasoning: false }],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    models.getAvailable = async () => [];
    const service = createPiModelCatalogService({
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(
      service.validateSelection({
        providerId: faux.provider.id,
        modelId: "filtered",
        thinkingLevel: "off",
      }),
    ).rejects.toMatchObject({ code: "model_unavailable" });
  });

  it("rejects unknown models and unsupported thinking levels", async () => {
    const faux = fauxProvider({
      models: [{ id: "plain", name: "Plain", reasoning: false }],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    const service = createPiModelCatalogService({
      credentials: new InMemoryCredentialStore(),
      models,
    });

    await expect(
      service.validateSelection({
        providerId: faux.provider.id,
        modelId: "missing",
        thinkingLevel: "off",
      }),
    ).rejects.toBeInstanceOf(PiModelCatalogError);
    await expect(
      service.validateSelection({
        providerId: faux.provider.id,
        modelId: "plain",
        thinkingLevel: "high",
      }),
    ).rejects.toMatchObject({ code: "thinking_level_unsupported" });
  });
});
