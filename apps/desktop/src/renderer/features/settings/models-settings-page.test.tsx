import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntimeDefaults,
  AgentModelDescriptor,
  FlowEvent,
  ProviderAuthOption,
} from "@spacezero/host-contracts";

import type { FlowEventSubscription, SubscribeFlowEventsInput } from "@spacezero/client-runtime";

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

type FlowEventSink = {
  readonly flowId: string;
  readonly emit: (event: FlowEvent) => void;
  readonly cancel: ReturnType<typeof vi.fn>;
};

function createFakeClients(overrides?: {
  providers?: ProviderAuthOption[];
  models?: AgentModelDescriptor[];
  defaults?: AgentRuntimeDefaults;
  flowId?: string;
}): ModelsSettingsClients & { readonly flowSinks: FlowEventSink[] } {
  const providers = overrides?.providers ?? [];
  const flowSinks: FlowEventSink[] = [];
  const flowId = overrides?.flowId ?? "flow-abc123";
  return {
    flowSinks,
    harnessAuth: {
      listProviderAuthOptions: vi.fn(async () => providers),
      startProviderOAuthLogin: vi.fn(async () => ({ flowId })),
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
    flows: {
      subscribeFlowEvents: vi.fn((input: SubscribeFlowEventsInput) => {
        const cancel = vi.fn<() => void>(() => undefined);
        const sink: FlowEventSink = {
          flowId: input.flowId,
          emit: (event: FlowEvent) => {
            input.onEvent({ flowId: input.flowId, sequence: 1, event });
          },
          cancel,
        };
        flowSinks.push(sink);
        return {
          cancel,
          closed: Promise.resolve(),
        } satisfies FlowEventSubscription;
      }),
      respondToPrompt: vi.fn(async () => undefined),
      cancelFlow: vi.fn(async () => undefined),
    },
    openExternalUrl: vi.fn(async () => ({ status: "opened" as const })),
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

  it("starts a Host OAuth flow and subscribes to its events when a subscription provider is selected", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "openai-subscription",
          displayName: "ChatGPT Plus/Pro",
          authMethods: ["oauth"],
        }),
      ],
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add subscription" }));
    fireEvent.click(await screen.findByRole("button", { name: /ChatGPT Plus\/Pro/ }));

    await waitFor(() => {
      expect(clients.harnessAuth.startProviderOAuthLogin).toHaveBeenCalledWith(
        "openai-subscription",
      );
    });
    expect(clients.flows.subscribeFlowEvents).toHaveBeenCalledTimes(1);
    expect(clients.flows.subscribeFlowEvents).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: "flow-abc123" }),
    );
    expect(screen.queryByRole("button", { name: /ChatGPT Plus\/Pro/ })).not.toBeInTheDocument();
  });

  it("surfaces flow progress and opens external auth URLs through the desktop-safe path", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "openai-subscription",
          displayName: "ChatGPT Plus/Pro",
          authMethods: ["oauth"],
        }),
      ],
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add subscription" }));
    fireEvent.click(await screen.findByRole("button", { name: /ChatGPT Plus\/Pro/ }));
    await waitFor(() => {
      expect(clients.flows.subscribeFlowEvents).toHaveBeenCalledTimes(1);
    });

    const sink = clients.flowSinks[0]!;
    sink.emit({ type: "flow.started" });
    expect(await screen.findByText("Connecting to ChatGPT Plus/Pro…")).toBeInTheDocument();

    sink.emit({
      type: "flow.external_url",
      url: "https://auth.openai.com/authorize?state=x",
      instructions: "Sign in to ChatGPT in your browser.",
    });
    await waitFor(() => {
      expect(clients.openExternalUrl).toHaveBeenCalledWith(
        "https://auth.openai.com/authorize?state=x",
      );
    });
    expect(screen.getByText("Sign in to ChatGPT in your browser.")).toBeInTheDocument();

    sink.emit({ type: "flow.progress", message: "Waiting for approval…" });
    expect(await screen.findByText("Waiting for approval…")).toBeInTheDocument();
    expect(clients.agentRuntime.listAgentRuntimeModels).toHaveBeenCalledTimes(1);
  });

  it("surfaces device-code prompts and keeps waiting for completion", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "anthropic-subscription",
          displayName: "Claude Pro/Max",
          authMethods: ["oauth"],
        }),
      ],
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add subscription" }));
    fireEvent.click(await screen.findByRole("button", { name: /Claude Pro\/Max/ }));
    await waitFor(() => {
      expect(clients.flows.subscribeFlowEvents).toHaveBeenCalledTimes(1);
    });

    const sink = clients.flowSinks[0]!;
    sink.emit({
      type: "flow.device_code",
      userCode: "WTX-J4TQ",
      verificationUri: "https://claude.ai/device",
    });

    expect(await screen.findByText(/Enter the code WTX-J4TQ/)).toBeInTheDocument();
    expect(clients.openExternalUrl).toHaveBeenCalledWith("https://claude.ai/device");
    expect(clients.harnessAuth.listProviderAuthOptions).toHaveBeenCalledTimes(1);
  });

  it("answers flow prompts through the flow client and refreshes state after completion", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "openai-subscription",
          displayName: "ChatGPT Plus/Pro",
          authMethods: ["oauth"],
        }),
      ],
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add subscription" }));
    fireEvent.click(await screen.findByRole("button", { name: /ChatGPT Plus\/Pro/ }));
    await waitFor(() => {
      expect(clients.flows.subscribeFlowEvents).toHaveBeenCalledTimes(1);
    });

    const sink = clients.flowSinks[0]!;
    sink.emit({
      type: "flow.prompt",
      promptId: "prompt-1",
      promptType: "text",
      message: "Enter the workspace name.",
    });
    const input = await screen.findByLabelText("Sign-in response");
    fireEvent.change(input, { target: { value: "my-workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(clients.flows.respondToPrompt).toHaveBeenCalledWith(
        "flow-abc123",
        "prompt-1",
        "my-workspace",
      );
    });
    expect(screen.queryByLabelText("Sign-in response")).not.toBeInTheDocument();

    sink.emit({ type: "flow.completed" });
    expect(await screen.findByText("ChatGPT Plus/Pro connected.")).toBeInTheDocument();
    await waitFor(() => {
      expect(clients.harnessAuth.listProviderAuthOptions).toHaveBeenCalledTimes(2);
      expect(clients.agentRuntime.listAgentRuntimeModels).toHaveBeenCalledTimes(2);
      expect(clients.agentRuntime.getAgentRuntimeDefaults).toHaveBeenCalledTimes(2);
    });
    expect(sink.cancel).toHaveBeenCalled();
  });

  it("cancels a pending flow prompt through the Host flow client", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "openai-subscription",
          displayName: "ChatGPT Plus/Pro",
          authMethods: ["oauth"],
        }),
      ],
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add subscription" }));
    fireEvent.click(await screen.findByRole("button", { name: /ChatGPT Plus\/Pro/ }));
    await waitFor(() => {
      expect(clients.flows.subscribeFlowEvents).toHaveBeenCalledTimes(1);
    });

    clients.flowSinks[0]!.emit({
      type: "flow.prompt",
      promptId: "prompt-2",
      promptType: "text",
      message: "Enter the workspace name.",
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(clients.flows.cancelFlow).toHaveBeenCalledWith("flow-abc123");
    });
    expect(screen.queryByLabelText("Sign-in response")).not.toBeInTheDocument();
  });

  it("surfaces flow failure states with the client-safe reason", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "openai-subscription",
          displayName: "ChatGPT Plus/Pro",
          authMethods: ["oauth"],
        }),
      ],
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add subscription" }));
    fireEvent.click(await screen.findByRole("button", { name: /ChatGPT Plus\/Pro/ }));
    await waitFor(() => {
      expect(clients.flows.subscribeFlowEvents).toHaveBeenCalledTimes(1);
    });

    clients.flowSinks[0]!.emit({ type: "flow.failed", reason: "Sign-in was denied in the browser." });

    expect(
      await screen.findByText("Sign-in was denied in the browser."),
    ).toBeInTheDocument();
    expect(clients.harnessAuth.listProviderAuthOptions).toHaveBeenCalledTimes(1);
  });

  it("shows a client-safe error when starting the OAuth flow fails", async () => {
    const clients = createFakeClients({
      providers: [
        providerOption({
          providerId: "openai-subscription",
          displayName: "ChatGPT Plus/Pro",
          authMethods: ["oauth"],
        }),
      ],
    });
    vi.mocked(clients.harnessAuth.startProviderOAuthLogin).mockRejectedValue({
      code: "harness_auth_unavailable",
      message: "Subscription sign-in is not available for this provider.",
    });

    render(<ModelsSettingsPage clients={clients} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add subscription" }));
    fireEvent.click(await screen.findByRole("button", { name: /ChatGPT Plus\/Pro/ }));

    expect(
      await screen.findByText("Subscription sign-in is not available for this provider."),
    ).toBeInTheDocument();
    expect(clients.flows.subscribeFlowEvents).not.toHaveBeenCalled();
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
