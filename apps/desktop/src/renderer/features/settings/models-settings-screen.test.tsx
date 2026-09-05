import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
