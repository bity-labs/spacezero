import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ModelsSettingsScreen, type ModelsSettingsScreenProps } from "./models-settings-screen";

const noOp = (): void => undefined;

const availableModels = [
  {
    providerId: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-4-5",
    modelLabel: "Claude Sonnet 4.5",
    description: "Fast, capable model for everyday coding work.",
    supportsThinking: true,
    supportedThinkingLevels: ["off", "low", "medium", "high", "max"],
  },
  {
    providerId: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-opus-4-1",
    modelLabel: "Claude Opus 4.1",
    description: "Highest-capability model for complex tasks.",
    supportsThinking: true,
    supportedThinkingLevels: ["off", "low", "medium", "high", "max"],
  },
  {
    providerId: "openai",
    providerLabel: "OpenAI",
    modelId: "gpt-5.2",
    modelLabel: "GPT-5.2",
    description: "General-purpose reasoning and coding model.",
    supportsThinking: true,
    supportedThinkingLevels: ["off", "low", "medium", "high"],
  },
] satisfies ModelsSettingsScreenProps["availableModels"];

const connectedArgs = {
  authSettings: {
    subscriptions: {
      connected: [
        {
          providerId: "anthropic-subscription",
          label: "Claude Pro/Max",
          configured: true,
          displayLabel: "Signed in with Claude",
          removable: true,
        },
      ],
      availableProviders: [
        {
          providerId: "openai-subscription",
          label: "ChatGPT Plus/Pro",
          description: "Connect a ChatGPT subscription in your browser.",
        },
      ],
    },
    apiKeys: {
      configured: [
        {
          providerId: "anthropic",
          label: "Anthropic",
          configured: true,
          displayLabel: "ANTHROPIC_API_KEY",
          source: "stored",
          removable: true,
        },
      ],
      availableProviders: [
        { providerId: "amazon-bedrock", label: "Amazon Bedrock" },
        { providerId: "ant-ling", label: "Ant Ling" },
        { providerId: "anthropic", label: "Anthropic (Claude Pro/Max)" },
        { providerId: "azure-openai-responses", label: "Azure OpenAI Responses" },
        { providerId: "cerebras", label: "Cerebras" },
        { providerId: "deepseek", label: "DeepSeek" },
        { providerId: "google", label: "Google Gemini", description: "Use a Google AI Studio API key." },
        { providerId: "openai", label: "OpenAI", description: "Use an OpenAI platform API key." },
      ],
    },
  },
  availableModels,
  modelDefaults: {
    defaultModel: { providerId: "anthropic", modelId: "claude-sonnet-4-5" },
    defaultThinking: "high",
  },
  isLoading: false,
  error: null,
  pendingProviderId: null,
  subscriptionStatusMessage: null,
  subscriptionStatusTone: "info",
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
} satisfies ModelsSettingsScreenProps;

const meta: Meta<typeof ModelsSettingsScreen> = {
  title: "Features/Settings/Screen/Models",
  component: ModelsSettingsScreen,
  decorators: [
    (Story) => (
      <div className="w-[746px] max-w-[calc(100vw-2rem)] py-8">
        <Story />
      </div>
    ),
  ],
  args: connectedArgs,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Loading: Story = {
  args: {
    ...connectedArgs,
    authSettings: null,
    availableModels: [],
    modelDefaults: null,
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    ...connectedArgs,
    authSettings: {
      subscriptions: {
        connected: [],
        availableProviders: connectedArgs.authSettings.subscriptions.availableProviders,
      },
      apiKeys: {
        configured: [],
        availableProviders: connectedArgs.authSettings.apiKeys.availableProviders,
      },
    },
    availableModels: [],
    modelDefaults: null,
  },
};

export const AvailableModels: Story = {
  args: {
    ...connectedArgs,
    modelDefaults: null,
  },
};

export const UnavailableDefault: Story = {
  args: {
    ...connectedArgs,
    availableModels: [availableModels[2]!],
    modelDefaults: {
      defaultModel: { providerId: "anthropic", modelId: "claude-opus-4-1" },
      defaultThinking: "high",
    },
  },
};

export const ThinkingFallback: Story = {
  args: {
    ...connectedArgs,
    availableModels: [
      {
        providerId: "mistral",
        providerLabel: "Mistral",
        modelId: "mistral-medium",
        modelLabel: "Mistral Medium",
        supportsThinking: false,
        supportedThinkingLevels: ["off"],
      },
    ],
    modelDefaults: {
      defaultModel: { providerId: "mistral", modelId: "mistral-medium" },
      defaultThinking: "off",
    },
  },
};

export const Error: Story = {
  args: {
    ...connectedArgs,
    error: "Model settings could not be loaded. Check your connection and try again.",
  },
};

export const SubscriptionProviderPicker: Story = {
  args: {
    ...connectedArgs,
    subscriptionPickerOpen: true,
  },
};

export const ApiKeyProviderPicker: Story = {
  args: {
    ...connectedArgs,
    apiKeyPickerOpen: true,
  },
};

export const ApiKeySetupFlow: Story = {
  render: () => <ApiKeySetupFlowStory />,
};

export const ApiKeyDialog: Story = {
  args: {
    ...connectedArgs,
    selectedApiKeyProvider: {
      providerId: "ant-ling",
      label: "Ant Ling",
    },
    apiKey: "sk-spacezero-example",
  },
};

export const DefaultModelPicker: Story = {
  args: {
    ...connectedArgs,
    defaultModelPickerOpen: true,
  },
};

function ApiKeySetupFlowStory() {
  const [apiKeyPickerOpen, setApiKeyPickerOpen] = useState(true);
  const [selectedApiKeyProvider, setSelectedApiKeyProvider] = useState<
    ModelsSettingsScreenProps["selectedApiKeyProvider"]
  >(null);
  const [apiKey, setApiKey] = useState("");

  return (
    <ModelsSettingsScreen
      {...connectedArgs}
      apiKeyPickerOpen={apiKeyPickerOpen}
      selectedApiKeyProvider={selectedApiKeyProvider}
      apiKey={apiKey}
      onApiKeyPickerOpenChange={setApiKeyPickerOpen}
      onApiKeyProviderSelect={(provider) => {
        setApiKeyPickerOpen(false);
        setSelectedApiKeyProvider(provider);
      }}
      onApiKeyChange={setApiKey}
      onApiKeyDialogClose={() => {
        setSelectedApiKeyProvider(null);
        setApiKey("");
      }}
    />
  );
}

export const SubscriptionConnectPending: Story = {
  args: {
    ...connectedArgs,
    authSettings: {
      ...connectedArgs.authSettings,
      subscriptions: {
        connected: [],
        availableProviders: connectedArgs.authSettings.subscriptions.availableProviders,
      },
    },
    pendingProviderId: "openai-subscription",
    subscriptionStatusMessage: "Connecting to ChatGPT Plus/Pro…",
  },
};

export const SubscriptionExternalUrlWaiting: Story = {
  args: {
    ...connectedArgs,
    authSettings: {
      ...connectedArgs.authSettings,
      subscriptions: {
        connected: [],
        availableProviders: connectedArgs.authSettings.subscriptions.availableProviders,
      },
    },
    subscriptionStatusMessage: "Finish signing in to ChatGPT Plus/Pro in your browser.",
  },
};

export const SubscriptionDeviceCode: Story = {
  args: {
    ...connectedArgs,
    authSettings: {
      ...connectedArgs.authSettings,
      subscriptions: {
        connected: [],
        availableProviders: connectedArgs.authSettings.subscriptions.availableProviders,
      },
    },
    subscriptionStatusMessage:
      "Enter the code WTX-J4TQ at https://claude.ai/device to finish signing in to Claude Pro/Max.",
  },
};

export const SubscriptionFlowPrompt: Story = {
  args: {
    ...connectedArgs,
    authSettings: {
      ...connectedArgs.authSettings,
      subscriptions: {
        connected: [],
        availableProviders: connectedArgs.authSettings.subscriptions.availableProviders,
      },
    },
    flowPrompt: {
      promptId: "prompt-1",
      promptType: "select",
      message: "Choose an organization.",
      options: [
        { id: "org-1", label: "Acme Inc" },
        { id: "org-2", label: "Globex", description: "Personal workspace" },
      ],
    },
  },
};

export const SubscriptionManualCodePrompt: Story = {
  args: {
    ...connectedArgs,
    authSettings: {
      ...connectedArgs.authSettings,
      subscriptions: {
        connected: [],
        availableProviders: connectedArgs.authSettings.subscriptions.availableProviders,
      },
    },
    flowPrompt: {
      promptId: "prompt-2",
      promptType: "manual_code",
      message: "Paste the code shown in your browser.",
      placeholder: "XXXX-XXXX",
    },
  },
};

export const SubscriptionConnected: Story = {
  args: {
    ...connectedArgs,
    subscriptionStatusMessage: "ChatGPT Plus/Pro connected.",
  },
};

export const SubscriptionFailed: Story = {
  args: {
    ...connectedArgs,
    subscriptionStatusMessage: "Sign-in was denied in the browser.",
    subscriptionStatusTone: "error",
  },
};

export const SubscriptionCancelled: Story = {
  args: {
    ...connectedArgs,
    subscriptionStatusMessage: "Sign-in to ChatGPT Plus/Pro was cancelled.",
  },
};
