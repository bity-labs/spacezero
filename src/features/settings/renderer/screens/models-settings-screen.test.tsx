import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ModelsSettingsScreenProps } from './models-settings-screen'
import { ModelsSettingsScreen } from './models-settings-screen'

function createProps(
  overrides: Partial<ModelsSettingsScreenProps> = {}
): ModelsSettingsScreenProps {
  return {
    authSettings: {
      subscriptions: {
        connected: [
          {
            providerId: 'anthropic-subscription',
            label: 'Claude Pro/Max',
            configured: true,
            displayLabel: 'Claude subscription',
            removable: true
          }
        ],
        availableProviders: [{ providerId: 'openai-subscription', label: 'ChatGPT Plus/Pro' }]
      },
      apiKeys: {
        configured: [],
        availableProviders: [{ providerId: 'anthropic', label: 'Anthropic' }]
      }
    },
    availableModels: [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'claude-sonnet-4-5',
        modelLabel: 'Claude Sonnet 4.5'
      }
    ],
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
    onSubscriptionPickerOpenChange: vi.fn(),
    onApiKeyPickerOpenChange: vi.fn(),
    onApiKeyProviderSelect: vi.fn(),
    onApiKeyChange: vi.fn(),
    onApiKeyDialogClose: vi.fn(),
    onConnectSubscription: vi.fn(),
    onDisconnectSubscription: vi.fn(),
    onSaveApiKey: vi.fn(),
    onRemoveApiKey: vi.fn(),
    onDefaultModelPickerOpenChange: vi.fn(),
    onSelectDefaultModel: vi.fn(),
    onSelectDefaultThinking: vi.fn(),
    ...overrides
  }
}

describe('ModelsSettingsScreen', () => {
  it('renders connected settings and delegates provider and model intent', async () => {
    const user = userEvent.setup()
    const onSubscriptionPickerOpenChange = vi.fn()
    const onDefaultModelPickerOpenChange = vi.fn()

    render(
      <ModelsSettingsScreen
        {...createProps({ onSubscriptionPickerOpenChange, onDefaultModelPickerOpenChange })}
      />
    )

    expect(screen.getByRole('heading', { name: 'Providers' })).toBeInTheDocument()
    expect(screen.getByText('Claude Pro/Max')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anthropic.*Claude Sonnet 4.5/ })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Add new' })[0])
    expect(onSubscriptionPickerOpenChange).toHaveBeenCalledWith(true)

    await user.click(screen.getByRole('button', { name: /Anthropic.*Claude Sonnet 4.5/ }))
    expect(onDefaultModelPickerOpenChange).toHaveBeenCalledWith(true)
  })

  it('renders provider, API key, and default model pickers from controlled state', async () => {
    const user = userEvent.setup()
    const onConnectSubscription = vi.fn()
    const onApiKeyChange = vi.fn()
    const onSaveApiKey = vi.fn()
    const onSelectDefaultModel = vi.fn()

    const { rerender } = render(
      <ModelsSettingsScreen
        {...createProps({
          subscriptionPickerOpen: true,
          onConnectSubscription
        })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'ChatGPT Plus/Pro' }))
    expect(onConnectSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'openai-subscription' })
    )

    rerender(
      <ModelsSettingsScreen
        {...createProps({
          selectedApiKeyProvider: { providerId: 'anthropic', label: 'Anthropic' },
          apiKey: 'secret-key',
          onApiKeyChange,
          onSaveApiKey
        })}
      />
    )
    await user.clear(screen.getByLabelText('API key'))
    await user.type(screen.getByLabelText('API key'), 'new-key')
    expect(onApiKeyChange).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSaveApiKey).toHaveBeenCalledOnce()

    rerender(
      <ModelsSettingsScreen
        {...createProps({ defaultModelPickerOpen: true, onSelectDefaultModel })}
      />
    )
    await user.click(screen.getByRole('button', { name: /Claude Sonnet 4.5/ }))
    expect(onSelectDefaultModel).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'claude-sonnet-4-5' })
    )
  })

  it('shows loading, empty, and error states without runtime dependencies', () => {
    const { rerender } = render(
      <ModelsSettingsScreen {...createProps({ isLoading: true, authSettings: null })} />
    )
    expect(screen.getAllByText('Loading model authentication settings…')).toHaveLength(2)

    rerender(
      <ModelsSettingsScreen
        {...createProps({
          authSettings: {
            subscriptions: { connected: [], availableProviders: [] },
            apiKeys: { configured: [], availableProviders: [] }
          },
          availableModels: [],
          modelDefaults: { defaultThinking: 'medium' }
        })}
      />
    )
    expect(screen.getByText('No subscriptions connected.')).toBeInTheDocument()
    expect(screen.getByText('No API keys configured.')).toBeInTheDocument()
    expect(screen.getByText('Configure credentials to choose a default model.')).toBeInTheDocument()

    rerender(<ModelsSettingsScreen {...createProps({ error: 'Model settings failed.' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Model settings failed.')
  })
})
