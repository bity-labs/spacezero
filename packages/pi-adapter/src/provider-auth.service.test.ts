import {
  InMemoryCredentialStore,
  type Models,
  type Provider,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  createProviderAuthService,
  ProviderAuthError,
  type ProviderLoginInteraction,
} from "./provider-auth.service.js";

const oauthProvider: Provider = {
  id: "anthropic",
  name: "Anthropic",
  auth: {
    oauth: {
      name: "Anthropic OAuth",
      login: async () => ({
        type: "oauth",
        access: "access-secret-marker",
        refresh: "refresh-secret-marker",
        expires: Date.now() + 60_000,
      }),
      refresh: async (credential) => credential,
      toAuth: async (credential) => ({ apiKey: credential.access }),
    },
  },
  getModels: () => [],
  stream: () => {
    throw new Error("not used");
  },
  streamSimple: () => {
    throw new Error("not used");
  },
};

const apiKeyOnlyProvider: Provider = {
  id: "openai",
  name: "OpenAI",
  auth: {
    apiKey: {
      name: "OpenAI key",
      resolve: async () => undefined,
    },
  },
  getModels: () => [],
  stream: () => {
    throw new Error("not used");
  },
  streamSimple: () => {
    throw new Error("not used");
  },
};

const fakeModels = (credentials: InMemoryCredentialStore): Models =>
  ({
    getProvider: (providerId: string) =>
      providerId === oauthProvider.id
        ? oauthProvider
        : providerId === apiKeyOnlyProvider.id
          ? apiKeyOnlyProvider
          : undefined,
    getProviders: () => [oauthProvider, apiKeyOnlyProvider],
    login: vi.fn(
      async (
        providerId: string,
        type: string,
        interaction: ProviderLoginInteraction,
      ) => {
        interaction.notify({ type: "progress", message: "Signing in" });
        const response = await interaction.prompt({
          type: "manual_code",
          message: "Paste code",
        });
        if (response !== "manual-secret-marker") throw new Error("bad code");
        await credentials.modify(providerId, async () => ({
          type: "oauth",
          access: "access-secret-marker",
          refresh: "refresh-secret-marker",
          expires: Date.now() + 60_000,
        }));
        return (await credentials.read(providerId))!;
      },
    ),
  }) as unknown as Models;

describe("ProviderAuthService OAuth login", () => {
  it("delegates OAuth login to Pi Models and returns non-secret status", async () => {
    const credentials = new InMemoryCredentialStore();
    const models = fakeModels(credentials);
    const service = createProviderAuthService({ credentials, models });
    const notify = vi.fn();

    const result = await service.loginOAuth("anthropic", {
      notify,
      prompt: async () => "manual-secret-marker",
    });

    expect(models.login).toHaveBeenCalledWith(
      "anthropic",
      "oauth",
      expect.objectContaining({ notify, prompt: expect.any(Function) }),
    );
    expect(result).toEqual({
      providerId: "anthropic",
      configured: true,
      source: "stored",
    });
    expect(JSON.stringify(result)).not.toContain("secret-marker");
    expect(notify).toHaveBeenCalledWith({
      type: "progress",
      message: "Signing in",
    });
  });

  it("rejects invalid and non-OAuth providers", async () => {
    const credentials = new InMemoryCredentialStore();
    const service = createProviderAuthService({
      credentials,
      models: fakeModels(credentials),
    });
    const interaction = {
      notify: vi.fn(),
      prompt: vi.fn(async () => "manual-secret-marker"),
    };

    await expect(
      service.loginOAuth("../anthropic", interaction),
    ).rejects.toMatchObject({
      code: "invalid_provider",
    });
    await expect(
      service.loginOAuth("openai", interaction),
    ).rejects.toBeInstanceOf(ProviderAuthError);
    await expect(
      service.loginOAuth("openai", interaction),
    ).rejects.toMatchObject({
      code: "provider_not_supported",
    });
  });
});
