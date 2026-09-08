import type {
  AgentRuntimeClient,
  GlobalChatSessionClient,
} from "@spacezero/client-runtime";
import type {
  AgentModelDescriptor,
  GetGlobalChatSessionRuntimeResult,
  UpdateGlobalChatSessionRuntimeResult,
} from "@spacezero/host-contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n/index.js";

import {
  GlobalChatSessionRuntimeSelector,
  nextThinkingLevelForModel,
  runtimeModelOptionsFromDescriptors,
  type GlobalChatSessionRuntimeSelectorClients,
} from "./global-chat-session-runtime-selector.js";

const sessionId = "22222222-2222-4222-8222-222222222222";

const descriptor = (
  overrides: Partial<AgentModelDescriptor>,
): AgentModelDescriptor => ({
  providerId: "anthropic",
  providerDisplayName: "Anthropic",
  modelId: "claude-sonnet-4-5",
  displayName: "Claude Sonnet 4.5",
  authenticated: true,
  available: true,
  reasoningSupported: true,
  supportedThinkingLevels: ["off", "low", "high"],
  ...overrides,
});

const models: readonly AgentModelDescriptor[] = [
  descriptor({
    modelId: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    reasoningSupported: false,
    supportedThinkingLevels: ["off"],
  }),
  descriptor({}),
  descriptor({
    providerId: "openai",
    providerDisplayName: "OpenAI",
    modelId: "gpt-5",
    displayName: "GPT-5",
    supportedThinkingLevels: ["off", "medium", "high"],
  }),
  descriptor({ available: false, modelId: "unavailable-model" }),
  descriptor({ authenticated: false, modelId: "unauthenticated-model" }),
];

const runtimeResult = (
  overrides: Partial<GetGlobalChatSessionRuntimeResult["runtime"]> = {},
): GetGlobalChatSessionRuntimeResult => ({
  session: {
    id: sessionId,
    title: "Runtime chat",
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSequence: 1,
  },
  runtime: {
    providerId: "anthropic",
    modelId: "claude-haiku-4-5",
    defaultThinkingLevel: "off",
    revision: 1,
    ...overrides,
  },
});

interface FakeClientsOptions {
  readonly runtime?: GetGlobalChatSessionRuntimeResult;
  readonly models?: readonly AgentModelDescriptor[];
  readonly updateResult?: UpdateGlobalChatSessionRuntimeResult;
  readonly updateError?: unknown;
}

const fakeClients = ({
  runtime = runtimeResult(),
  models: catalog = models,
  updateResult,
  updateError,
}: FakeClientsOptions = {}) => {
  const chat = {
    getRuntime: vi.fn(async () => runtime),
    updateRuntime: vi.fn(async () => {
      if (updateError !== undefined) throw updateError;
      return (
        updateResult ?? {
          session: runtime.session,
          runtime: {
            ...runtime.runtime,
            revision: runtime.runtime.revision + 1,
          },
        }
      );
    }),
  } as unknown as Pick<
    GlobalChatSessionClient,
    "getRuntime" | "updateRuntime"
  > &
    Record<string, ReturnType<typeof vi.fn>>;
  const agentRuntime = {
    listAgentRuntimeModels: vi.fn(async () => ({ models: catalog })),
  } as unknown as Pick<AgentRuntimeClient, "listAgentRuntimeModels"> &
    Record<string, ReturnType<typeof vi.fn>>;
  return { chat, agentRuntime };
};

const renderSelector = (
  clients: GlobalChatSessionRuntimeSelectorClients,
): void => {
  render(
    <GlobalChatSessionRuntimeSelector
      sessionId={sessionId}
      clients={clients}
    />,
  );
};

afterEach(() => {
  cleanup();
});

describe("Global Chat Session runtime selector", () => {
  it("builds sanitized selector options from available and authenticated descriptors only", () => {
    const options = runtimeModelOptionsFromDescriptors(models);

    expect(options.map((entry) => entry.option.id)).toEqual([
      "anthropic:claude-haiku-4-5",
      "anthropic:claude-sonnet-4-5",
      "openai:gpt-5",
    ]);
    expect(options[0]?.option.supportedThinkingLevels).toEqual(["off"]);
    expect(options[1]?.option.name).toBe("Claude Sonnet 4.5");
  });

  it("keeps the current thinking level only when the new model supports it", () => {
    const sonnet = models.find(
      (model) => model.modelId === "claude-sonnet-4-5",
    );
    const haiku = models.find((model) => model.modelId === "claude-haiku-4-5");
    const gpt5 = models.find((model) => model.modelId === "gpt-5");
    expect(sonnet).toBeDefined();
    expect(haiku).toBeDefined();
    expect(gpt5).toBeDefined();

    expect(nextThinkingLevelForModel(sonnet!, "low")).toBe("low");
    expect(nextThinkingLevelForModel(haiku!, "high")).toBe("off");
    expect(nextThinkingLevelForModel(gpt5!, "medium")).toBe("medium");
  });

  it("loads the runtime configuration and sanitized model catalog into the selector", async () => {
    const clients = fakeClients();
    renderSelector(clients);

    await waitFor(() => {
      expect(clients.chat.getRuntime).toHaveBeenCalledWith(sessionId);
      expect(clients.agentRuntime.listAgentRuntimeModels).toHaveBeenCalled();
    });
    expect(
      await screen.findByTestId("session-runtime-model-selector-trigger"),
    ).toHaveTextContent("Claude Haiku 4.5");
  });

  it("applies thinking-level changes with expected revision semantics", async () => {
    const clients = fakeClients({
      runtime: runtimeResult({
        modelId: "claude-sonnet-4-5",
        defaultThinkingLevel: "low",
      }),
    });
    renderSelector(clients);

    await waitFor(() => {
      expect(
        screen.getByTestId("session-runtime-model-selector-trigger"),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByTestId("session-runtime-model-selector-trigger"),
    );
    const high = screen.getByRole("radio", { name: "High" });
    fireEvent.click(high);

    await waitFor(() => {
      expect(clients.chat.updateRuntime).toHaveBeenCalledWith(sessionId, {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        defaultThinkingLevel: "high",
        expectedRevision: 1,
      });
    });
  });

  it("applies model changes through the same Host-owned runtime configuration", async () => {
    const clients = fakeClients();
    renderSelector(clients);

    await waitFor(() => {
      expect(
        screen.getByTestId("session-runtime-model-selector-trigger"),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByTestId("session-runtime-model-selector-trigger"),
    );
    fireEvent.click(screen.getByRole("option", { name: /GPT-5/ }));

    await waitFor(() => {
      expect(clients.chat.updateRuntime).toHaveBeenCalledWith(sessionId, {
        providerId: "openai",
        modelId: "gpt-5",
        defaultThinkingLevel: "off",
        expectedRevision: 1,
      });
    });
  });

  it("surfaces revision conflicts, reloads the Host-owned runtime, and retries with the current revision", async () => {
    const conflict = Object.assign(
      new Error(
        "This Global Chat Session runtime configuration changed. Reload and try again.",
      ),
      { code: "global_chat_session_runtime_revision_conflict" },
    );
    const clients = fakeClients({
      updateError: conflict,
    });
    renderSelector(clients);

    await waitFor(() => {
      expect(
        screen.getByTestId("session-runtime-model-selector-trigger"),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByTestId("session-runtime-model-selector-trigger"),
    );
    fireEvent.click(screen.getByRole("option", { name: /GPT-5/ }));

    await waitFor(() => {
      expect(
        screen.getByTestId("global-chat-session-runtime-error"),
      ).toHaveTextContent(/changed/i);
    });
    // The container reloaded the Host-owned runtime after the conflict.
    expect(clients.chat.getRuntime).toHaveBeenCalledTimes(2);
  });

  it("renders a load failure alert without a selector", async () => {
    const chat = {
      getRuntime: vi.fn(async () => {
        throw new Error("unavailable");
      }),
      updateRuntime: vi.fn(),
    } as unknown as Pick<
      GlobalChatSessionClient,
      "getRuntime" | "updateRuntime"
    >;
    const agentRuntime = {
      listAgentRuntimeModels: vi.fn(async () => ({ models: [] })),
    } as unknown as Pick<AgentRuntimeClient, "listAgentRuntimeModels">;

    renderSelector({ chat, agentRuntime });

    await waitFor(() => {
      expect(
        screen.getByTestId("global-chat-session-runtime-error"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("session-runtime-model-selector-trigger"),
    ).not.toBeInTheDocument();
  });
});
