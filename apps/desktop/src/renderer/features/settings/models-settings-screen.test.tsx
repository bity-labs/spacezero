import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ModelsSettingsScreen,
  defaultThinkingOptions,
  type AvailableModel,
  type ModelsSettingsScreenProps,
} from "./models-settings-screen";

const noOp = (): void => undefined;

const base = {
  isLoading: false,
  error: null,
  pendingProviderId: null,
  subscriptionStatusMessage: null,
  subscriptionStatusTone: "info" as const,
  flowPrompt: null,
  subscriptionPickerOpen: false,
  apiKeyPickerOpen: false,
  selectedApiKeyProvider: null,
  apiKey: "",
  defaultModelPickerOpen: false,
  onSubscriptionPickerOpenChange: noOp,
  onApiKeyPickerOpenChange: noOp,
  onApiKeyProviderSelect: noOp,
  onApiKeyChange: noOp,
  onApiKeyDialogClose: noOp,
  onConnectSubscription: noOp,
  onDisconnectSubscription: noOp,
  onFlowPromptSubmit: noOp,
  onFlowPromptCancel: noOp,
  onSaveApiKey: noOp,
  onRemoveApiKey: noOp,
  onDefaultModelPickerOpenChange: noOp,
  onSelectDefaultModel: noOp,
  onSelectDefaultThinking: noOp,
} satisfies Omit<ModelsSettingsScreenProps, "authSettings" | "availableModels" | "modelDefaults">;

const defaultModel = {
  providerId: "openai",
  providerLabel: "OpenAI",
  modelId: "gpt-5.2",
  modelLabel: "GPT-5.2",
  supportsThinking: true,
  supportedThinkingLevels: ["off", "medium"] as const,
};

afterEach(() => {
  cleanup();
});

describe("defaultThinkingOptions", () => {
  it("offers only the thinking levels supported by the selected default model", () => {
    expect(defaultThinkingOptions(defaultModel)).toEqual(["off", "medium"]);
  });

  it("falls back to all thinking levels without a selected model or thinking metadata", () => {
    expect(defaultThinkingOptions()).toHaveLength(7);
    const modelWithoutLevels: AvailableModel = { ...defaultModel };
    delete modelWithoutLevels.supportedThinkingLevels;
    expect(defaultThinkingOptions(modelWithoutLevels)).toHaveLength(7);
  });
});

describe("ModelsSettingsScreen defaults", () => {
  it("shows the selected default model", () => {
    render(
      <ModelsSettingsScreen
        {...base}
        authSettings={null}
        availableModels={[defaultModel]}
        modelDefaults={{
          defaultModel: { providerId: "openai", modelId: "gpt-5.2" },
          defaultThinking: "medium",
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "OpenAI · GPT-5.2" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Default thinking")).toHaveTextContent("Medium");
  });

  it("warns when the stored default model is no longer available", () => {
    render(
      <ModelsSettingsScreen
        {...base}
        authSettings={null}
        availableModels={[
          { providerId: "anthropic", providerLabel: "Anthropic", modelId: "claude-sonnet-4-5", modelLabel: "Claude Sonnet 4.5", supportsThinking: true },
        ]}
        modelDefaults={{
          defaultModel: { providerId: "openai", modelId: "removed-model" },
        }}
      />,
    );

    expect(
      screen.getByText("The selected default model is no longer available."),
    ).toBeInTheDocument();
  });
});

describe("ModelsSettingsScreen subscription status and flow prompts", () => {
  it("renders the subscription status message with an error tone when asked", () => {
    render(
      <ModelsSettingsScreen
        {...base}
        authSettings={null}
        availableModels={[]}
        modelDefaults={null}
        subscriptionStatusMessage="Sign-in was denied in the browser."
        subscriptionStatusTone="error"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Sign-in was denied in the browser.",
    );
  });

  it("renders a text flow prompt with a submit and cancel action", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <ModelsSettingsScreen
        {...base}
        authSettings={null}
        availableModels={[]}
        modelDefaults={null}
        flowPrompt={{
          promptId: "prompt-1",
          promptType: "text",
          message: "Enter the workspace name.",
          placeholder: "acme",
        }}
        onFlowPromptSubmit={onSubmit}
        onFlowPromptCancel={onCancel}
      />,
    );

    const input = screen.getByLabelText("Sign-in response");
    expect(input).toHaveAttribute("type", "text");
    fireEvent.change(input, { target: { value: "my-workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith("my-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("masks secret flow prompt responses and clears the raw value after submit", () => {
    const onSubmit = vi.fn();
    render(
      <ModelsSettingsScreen
        {...base}
        authSettings={null}
        availableModels={[]}
        modelDefaults={null}
        flowPrompt={{
          promptId: "prompt-2",
          promptType: "secret",
          message: "Paste the one-time code.",
        }}
        onFlowPromptSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText("Sign-in response");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: "one-time-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith("one-time-secret");
    expect(input).toHaveValue("");
  });

  it("submits the chosen option id for select flow prompts", () => {
    const onSubmit = vi.fn();
    render(
      <ModelsSettingsScreen
        {...base}
        authSettings={null}
        availableModels={[]}
        modelDefaults={null}
        flowPrompt={{
          promptId: "prompt-3",
          promptType: "select",
          message: "Choose an organization.",
          options: [
            { id: "org-1", label: "Acme Inc" },
            { id: "org-2", label: "Globex" },
          ],
        }}
        onFlowPromptSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Globex" }));
    expect(onSubmit).toHaveBeenCalledWith("org-2");
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });
});
