import { afterEach, describe, expect, it, vi } from 'vitest'

import { addApiKey, getAvailableModels, getModelAuthSettings, loginOAuth } from './model-auth-settings.service'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('model auth settings service', () => {
  it('does not create fake runtime auth for API keys or OAuth subscriptions', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')

    await expect(addApiKey('anthropic', 'sk-test')).rejects.toThrow('agent.apiKeyAuthNotImplemented')
    await expect(loginOAuth('chatgpt')).rejects.toThrow('agent.oauthNotImplemented')

    await expect(getModelAuthSettings()).resolves.toMatchObject({
      subscriptions: { connected: [] },
      apiKeys: { configured: [] }
    })
    await expect(getAvailableModels()).resolves.toEqual([])
  })
})
