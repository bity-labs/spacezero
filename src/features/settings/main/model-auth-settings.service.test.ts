import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addApiKey, getModelAuthSettings, removeApiKey, testAuth } from './model-auth-settings.service'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'

vi.mock('../../agent-workspace/main/agent-utility-process', () => ({
  getAgentUtilityProcessHost: vi.fn()
}))

describe('model auth settings service', () => {
  beforeEach(() => {
    vi.mocked(getAgentUtilityProcessHost).mockReturnValue({
      getAuthStatus: vi.fn(async () => ({
        subscriptions: { connected: [], availableProviders: [] },
        apiKeys: {
          configured: [
            {
              providerId: 'anthropic',
              label: 'Anthropic',
              configured: true,
              source: 'stored',
              removable: true
            }
          ],
          availableProviders: [{ providerId: 'anthropic', label: 'Anthropic' }]
        }
      })),
      addApiKey: vi.fn(async () => undefined),
      removeApiKey: vi.fn(async () => undefined),
      testAuth: vi.fn(async () => ({ ok: true }))
    } as unknown as ReturnType<typeof getAgentUtilityProcessHost>)
  })

  it('brokers auth commands to the agent utility without returning credentials', async () => {
    const host = getAgentUtilityProcessHost()

    await addApiKey('anthropic', 'sk-secret')
    await removeApiKey('anthropic')
    await expect(testAuth('anthropic')).resolves.toEqual({ ok: true })

    const status = await getModelAuthSettings()

    expect(host.addApiKey).toHaveBeenCalledWith({ providerId: 'anthropic', apiKey: 'sk-secret' })
    expect(host.removeApiKey).toHaveBeenCalledWith({ providerId: 'anthropic' })
    expect(host.testAuth).toHaveBeenCalledWith({ providerId: 'anthropic' })
    expect(JSON.stringify(status)).not.toContain('sk-secret')
  })
})
