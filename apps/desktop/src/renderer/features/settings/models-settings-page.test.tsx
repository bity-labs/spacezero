import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntimeDefaults,
  AgentModelDescriptor,
  ProviderAuthOption,
} from "@spacezero/host-contracts";

import { ModelsSettingsPage } from "./models-settings-page";
import type { ModelsSettingsClients } from "./use-models-settings";

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

const freshDefaults: AgentRuntimeDefaults = {
  defaultModel: null,
  defaultThinkingLevel: null,
};

function createFakeClients(overrides?: {
  providers?: ProviderAuthOption[];
  models?: AgentModelDescriptor[];
  defaults?: AgentRuntimeDefaults;
}): ModelsSettingsClients {
  const providers = overrides?.providers ?? [];
  return {
    harnessAuth: {
      listProviderAuthOptions: vi.fn(async () => providers),
      setProviderApiKey: vi.fn(async () => ({
        providerId: "openai",
        configured: true,
        source: "stored" as const,
      })),
      removeProviderApiKey: vi.fn(async () => ({
        providerId: "openai",
        configured: false,
        source: "missing" as const,
      })),
    },
    agentRuntime: {
      listAgentRuntimeModels: vi.fn(async () => ({ models: overrides?.models ?? [] })),
      getAgentRuntimeDefaults: vi.fn(async () => ({
        defaults: overrides?.defaults ?? freshDefaults,
      })),
      updateAgentRuntimeDefaults: vi.fn(async () => ({
        defaults: overrides?.defaults ?? freshDefaults,
      })),
    },
  };
}

afterEach(() => {
  cleanup();
});

describe("ModelsSettingsPage", () => {
  it("loads provider auth, models, and defaults from the Host and renders the fresh empty state", async () => {
    const clients = createFakeClients();
    render(<ModelsSettingsPage clients={clients} />);

    expect(
      await screen.findByText("No subscriptions connected"),
    ).toBeInTheDocument();
    expect(screen.getByText("No API keys configured")).toBeInTheDocument();
    expect(screen.getByText("No models available")).toBeInTheDocument();
    expect(clients.harnessAuth.listProviderAuthOptions).toHaveBeenCalledTimes(1);
    expect(clients.agentRuntime.listAgentRuntimeModels).toHaveBeenCalledTimes(1);
    expect(clients.agentRuntime.getAgentRuntimeDefaults).toHaveBeenCalledTimes(1);
  });

  it("shows a pending state until all Host data has loaded", async () => {
    let resolveProviders: (value: ProviderAuthOption[]) => void = () => undefined;
    const clients = createFakeClients({
      models: [modelDescriptor()],
      defaults: freshDefaults,
    });
    vi.mocked(clients.harnessAuth.listProviderAuthOptions).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProviders = resolve;
        }),
    );

    render(<ModelsSettingsPage clients={clients} />);

    expect(
      screen.queryByRole("button", { name: "Choose model" }),
    ).not.toBeInTheDocument();

    resolveProviders([]);
    expect(
      await screen.findByRole("button", { name: "Choose model" }),
    ).toBeInTheDocument();
  });

  it("adds an API key, clears the raw key, and refreshes Host state", async () => {
    const clients = createFakeClients();
    vi.mocked(clients.harnessAuth.listProviderAuthOptions)
      .mockResolvedValueOnce([providerOption({ providerId: "openai", displayName: "OpenAI" })])
      .mockResolvedValue([
        providerOption({
          providerId: "openai",
          displayName: "OpenAI",
          configured: true,
          configuredMethod: "api_key",
        }),
      ]);

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add API key" }));

    fireEvent.click(await screen.findByRole("button", { name: /OpenAI/ }));
    const apiKeyInput = await screen.findByLabelText("API key");
    fireEvent.change(apiKeyInput, { target: { value: "sk-test-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(clients.harnessAuth.setProviderApiKey).toHaveBeenCalledWith(
        "openai",
        "sk-test-123",
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("API key stored")).toBeInTheDocument();
    expect(clients.harnessAuth.listProviderAuthOptions).toHaveBeenCalledTimes(2);
    expect(clients.agentRuntime.listAgentRuntimeModels).toHaveBeenCalledTimes(2);
    expect(clients.agentRuntime.getAgentRuntimeDefaults).toHaveBeenCalledTimes(2);
  });

  it("removes an API key and refreshes Host state", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "anthropic",
          displayName: "Anthropic",
          configured: true,
          configuredMethod: "api_key",
        }),
      ],
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove API key" }));

    await waitFor(() => {
      expect(clients.harnessAuth.removeProviderApiKey).toHaveBeenCalledWith(
        "anthropic",
      );
    });
    await waitFor(() => {
      expect(clients.harnessAuth.listProviderAuthOptions).toHaveBeenCalledTimes(2);
    });
  });

  it("browses models and persists the Host-global default model", async () => {
    const clients = createFakeClients({
      models: [modelDescriptor()],
    });
    vi.mocked(clients.agentRuntime.updateAgentRuntimeDefaults).mockImplementation(
      async (request) => ({
        defaults: {
          defaultModel: request.defaultModel ?? null,
          defaultThinkingLevel: null,
        },
      }),
    );

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose model" }));

    fireEvent.click(await screen.findByRole("button", { name: /GPT-5\.2/ }));

    await waitFor(() => {
      expect(clients.agentRuntime.updateAgentRuntimeDefaults).toHaveBeenCalledWith({
        defaultModel: { providerId: "openai", modelId: "gpt-5.2" },
      });
    });
    expect(
      await screen.findByRole("button", { name: "OpenAI · GPT-5.2" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Search models")).not.toBeInTheDocument();
  });

  it("shows an error when loading model settings fails", async () => {
    const clients = createFakeClients();
    vi.mocked(clients.harnessAuth.listProviderAuthOptions).mockRejectedValue(
      new Error("host unavailable"),
    );

    render(<ModelsSettingsPage clients={clients} />);

    expect(
      await screen.findByText(
        "Model settings could not be loaded. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces client-safe errors and clears the raw key when saving fails", async () => {
    const clients = createFakeClients({
      providers: [providerOption({ providerId: "openai", displayName: "OpenAI" })],
    });
    vi.mocked(clients.harnessAuth.setProviderApiKey).mockRejectedValue({
      code: "invalid_api_key",
      message: "Enter a valid API key.",
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add API key" }));
    fireEvent.click(await screen.findByRole("button", { name: /OpenAI/ }));
    const apiKeyInput = await screen.findByLabelText("API key");
    fireEvent.change(apiKeyInput, { target: { value: "bad-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a valid API key.")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
  });

  it("shows an error when a defaults update fails", async () => {
    const clients = createFakeClients({
      models: [modelDescriptor()],
    });
    vi.mocked(clients.agentRuntime.updateAgentRuntimeDefaults).mockRejectedValue({
      code: "model_unavailable",
      message: "The selected model is not currently available.",
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose model" }));
    fireEvent.click(await screen.findByRole("button", { name: /GPT-5\.2/ }));

    expect(
      await screen.findByText(
        "The selected model is not currently available.",
      ),
    ).toBeInTheDocument();
  });
});
