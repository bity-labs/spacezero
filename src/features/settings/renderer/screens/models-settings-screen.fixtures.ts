import type { ModelsSettingsScreenProps } from './models-settings-screen'

const noOp = (): void => undefined

const availableModels = [
  {
    providerId: 'anthropic',
    providerLabel: 'Anthropic',
    modelId: 'claude-sonnet-4-5',
    modelLabel: 'Claude Sonnet 4.5',
    description: 'Fast, capable model for everyday coding work.',
    supportsThinking: true
  },
  {
    providerId: 'anthropic',
    providerLabel: 'Anthropic',
    modelId: 'claude-opus-4-1',
    modelLabel: 'Claude Opus 4.1',
    description: 'Highest-capability model for complex tasks.',
    supportsThinking: true
  },
  {
    providerId: 'openai',
    providerLabel: 'OpenAI',
    modelId: 'gpt-5.2',
    modelLabel: 'GPT-5.2',
    description: 'General-purpose reasoning and coding model.',
    supportsThinking: true
  }
] satisfies ModelsSettingsScreenProps['availableModels']

export const connectedModelsSettingsFixture = {
  authSettings: {
    subscriptions: {
      connected: [
        {
          providerId: 'anthropic-subscription',
          label: 'Claude Pro/Max',
          configured: true,
          displayLabel: 'Signed in with Claude',
          removable: true
        }
      ],
      availableProviders: [
        {
          providerId: 'openai-subscription',
          label: 'ChatGPT Plus/Pro',
          description: 'Connect a ChatGPT subscription in your browser.'
        }
      ]
    },
    apiKeys: {
      configured: [
        {
          providerId: 'anthropic',
          label: 'Anthropic',
          configured: true,
          displayLabel: 'ANTHROPIC_API_KEY',
          source: 'stored',
          removable: true
        }
      ],
      availableProviders: [
        {
          providerId: 'openai',
          label: 'OpenAI',
          description: 'Use an OpenAI platform API key.'
        },
        {
          providerId: 'google',
          label: 'Google Gemini',
          description: 'Use a Google AI Studio API key.'
        }
      ]
    }
  },
  availableModels,
  modelDefaults: {
    defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    defaultThinking: 'high'
  },
  isLoading: false,
  error: null,
  pendingProviderId: null,
  subscriptionStatusMessage: null,
  subscriptionPickerOpen: false,
  apiKeyPickerOpen: false,
  selectedApiKeyProvider: null,
  apiKey: '',
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
  onSelectDefaultThinking: noOp
} satisfies ModelsSettingsScreenProps

export const loadingModelsSettingsFixture = {
  ...connectedModelsSettingsFixture,
  authSettings: null,
  availableModels: [],
  modelDefaults: null,
  isLoading: true
} satisfies ModelsSettingsScreenProps

export const emptyModelsSettingsFixture = {
  ...connectedModelsSettingsFixture,
  authSettings: {
    subscriptions: {
      connected: [],
      availableProviders:
        connectedModelsSettingsFixture.authSettings.subscriptions.availableProviders
    },
    apiKeys: {
      configured: [],
      availableProviders: connectedModelsSettingsFixture.authSettings.apiKeys.availableProviders
    }
  },
  availableModels: [],
  modelDefaults: { defaultThinking: 'medium' }
} satisfies ModelsSettingsScreenProps

export const errorModelsSettingsFixture = {
  ...emptyModelsSettingsFixture,
  error: 'Model settings could not be loaded. Check your connection and try again.'
} satisfies ModelsSettingsScreenProps

export const providerPickerModelsSettingsFixture = {
  ...connectedModelsSettingsFixture,
  subscriptionPickerOpen: true
} satisfies ModelsSettingsScreenProps

export const apiKeyDialogModelsSettingsFixture = {
  ...connectedModelsSettingsFixture,
  selectedApiKeyProvider: {
    providerId: 'openai',
    label: 'OpenAI',
    description: 'Use an OpenAI platform API key.'
  },
  apiKey: 'sk-spacezero-example'
} satisfies ModelsSettingsScreenProps

export const defaultModelPickerModelsSettingsFixture = {
  ...connectedModelsSettingsFixture,
  defaultModelPickerOpen: true
} satisfies ModelsSettingsScreenProps
