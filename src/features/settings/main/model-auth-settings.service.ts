import type {
  AuthProviderOption,
  AuthProviderStatus,
  ModelAuthSettings
} from '../../../shared/model-auth'
import type { AvailableModel } from '../../../shared/model-settings'

const apiKeyProviders = [
  { providerId: 'anthropic', label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY' },
  { providerId: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY' },
  { providerId: 'openrouter', label: 'OpenRouter', envKey: 'OPENROUTER_API_KEY' },
  { providerId: 'google', label: 'Google AI', envKey: 'GOOGLE_API_KEY' }
] as const

const availableModelCatalog: Record<string, Omit<AvailableModel, 'providerLabel'>[]> = {
  anthropic: [
    {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      modelLabel: 'Claude Sonnet 4',
      description: 'Balanced Claude model for everyday agent work.',
      contextWindow: 200000,
      supportsThinking: true
    },
    {
      providerId: 'anthropic',
      modelId: 'claude-opus-4',
      modelLabel: 'Claude Opus 4',
      description: 'Highest-capability Claude model for complex work.',
      contextWindow: 200000,
      supportsThinking: true
    }
  ],
  openai: [
    {
      providerId: 'openai',
      modelId: 'gpt-5',
      modelLabel: 'GPT-5',
      description: 'OpenAI flagship reasoning model.',
      supportsThinking: true
    },
    {
      providerId: 'openai',
      modelId: 'gpt-4.1',
      modelLabel: 'GPT-4.1',
      description: 'General-purpose OpenAI model.',
      supportsThinking: false
    }
  ],
  openrouter: [
    {
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      modelLabel: 'Claude Sonnet 4',
      description: 'Claude Sonnet through OpenRouter.',
      supportsThinking: true
    },
    {
      providerId: 'openrouter',
      modelId: 'openai/gpt-5',
      modelLabel: 'GPT-5',
      description: 'GPT-5 through OpenRouter.',
      supportsThinking: true
    },
    {
      providerId: 'openrouter',
      modelId: 'google/gemini-2.5-pro',
      modelLabel: 'Gemini 2.5 Pro',
      description: 'Gemini Pro through OpenRouter.',
      supportsThinking: true
    }
  ],
  google: [
    {
      providerId: 'google',
      modelId: 'gemini-2.5-pro',
      modelLabel: 'Gemini 2.5 Pro',
      description: 'Google reasoning model.',
      contextWindow: 1000000,
      supportsThinking: true
    }
  ],
  chatgpt: [
    {
      providerId: 'chatgpt',
      modelId: 'gpt-5',
      modelLabel: 'GPT-5',
      description: 'Available through a connected ChatGPT subscription.',
      supportsThinking: true
    }
  ],
  claude: [
    {
      providerId: 'claude',
      modelId: 'claude-sonnet-4',
      modelLabel: 'Claude Sonnet 4',
      description: 'Available through a connected Claude subscription.',
      supportsThinking: true
    }
  ],
  'github-copilot': [
    {
      providerId: 'github-copilot',
      modelId: 'copilot-gpt-5',
      modelLabel: 'GPT-5 via Copilot',
      description: 'Available through a connected GitHub Copilot subscription.',
      supportsThinking: true
    }
  ]
}

const subscriptionProviders: readonly AuthProviderOption[] = [
  {
    providerId: 'chatgpt',
    label: 'ChatGPT Plus/Pro',
    description: 'Connect a ChatGPT subscription through your browser.'
  },
  {
    providerId: 'claude',
    label: 'Claude Pro/Max',
    description: 'Connect a Claude subscription through your browser.'
  },
  {
    providerId: 'github-copilot',
    label: 'GitHub Copilot',
    description: 'Connect a GitHub Copilot subscription through your browser.'
  }
]

const storedApiKeyProviderIds = new Set<string>()
const connectedSubscriptionProviderIds = new Set<string>()

export async function getModelAuthSettings(): Promise<ModelAuthSettings> {
  return {
    subscriptions: {
      connected: subscriptionProviders
        .filter((provider) => connectedSubscriptionProviderIds.has(provider.providerId))
        .map((provider) => ({
          providerId: provider.providerId,
          label: provider.label,
          configured: true,
          source: 'runtime',
          displayLabel: 'Temporary runtime connection',
          removable: true
        })),
      availableProviders: [...subscriptionProviders]
    },
    apiKeys: {
      configured: getConfiguredApiKeyProviders(),
      availableProviders: apiKeyProviders.map(({ providerId, label }) => ({ providerId, label }))
    }
  }
}

export async function getAvailableModels(): Promise<AvailableModel[]> {
  const configuredProviders = new Map<string, string>()

  for (const provider of getConfiguredApiKeyProviders()) {
    configuredProviders.set(provider.providerId, provider.label)
  }

  for (const provider of subscriptionProviders) {
    if (connectedSubscriptionProviderIds.has(provider.providerId)) {
      configuredProviders.set(provider.providerId, provider.label)
    }
  }

  return [...configuredProviders.entries()].flatMap(([providerId, providerLabel]) =>
    (availableModelCatalog[providerId] ?? []).map((model) => ({ ...model, providerLabel }))
  )
}

export async function addApiKey(providerId: string, apiKey: string): Promise<void> {
  assertKnownApiKeyProvider(providerId)
  if (!apiKey.trim()) throw new Error('agent.emptyApiKey')

  storedApiKeyProviderIds.add(providerId)
}

export async function removeApiKey(providerId: string): Promise<void> {
  assertKnownApiKeyProvider(providerId)
  storedApiKeyProviderIds.delete(providerId)
}

export async function loginOAuth(providerId: string): Promise<void> {
  assertKnownSubscriptionProvider(providerId)
  connectedSubscriptionProviderIds.add(providerId)
}

export async function logoutOAuth(providerId: string): Promise<void> {
  assertKnownSubscriptionProvider(providerId)
  connectedSubscriptionProviderIds.delete(providerId)
}

function getConfiguredApiKeyProviders(): AuthProviderStatus[] {
  const configuredProviders: AuthProviderStatus[] = []

  for (const provider of apiKeyProviders) {
    const envConfigured = Boolean(process.env[provider.envKey])
    const storedConfigured = storedApiKeyProviderIds.has(provider.providerId)

    if (envConfigured) {
      configuredProviders.push({
        providerId: provider.providerId,
        label: provider.label,
        configured: true,
        source: 'environment',
        displayLabel: `Configured from ${provider.envKey}`,
        removable: false
      })
      continue
    }

    if (storedConfigured) {
      configuredProviders.push({
        providerId: provider.providerId,
        label: provider.label,
        configured: true,
        source: 'runtime',
        displayLabel: 'Temporary runtime API key',
        removable: true
      })
    }
  }

  return configuredProviders
}

function assertKnownApiKeyProvider(providerId: string): void {
  if (!apiKeyProviders.some((provider) => provider.providerId === providerId)) {
    throw new Error('agent.unknownApiKeyProvider')
  }
}

function assertKnownSubscriptionProvider(providerId: string): void {
  if (!subscriptionProviders.some((provider) => provider.providerId === providerId)) {
    throw new Error('agent.unknownSubscriptionProvider')
  }
}
